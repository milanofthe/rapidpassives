#########################################################################################
##
##                                RAPID PASSIVES GUI
##
##                                   Milan Rother
##
#########################################################################################

# imports -------------------------------------------------------------------------------

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from tkinter import font as tkfont

import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

from rapidpassives import SpiralInductor, SymmetricInductor, SymmetricTransformer


# utility classes -----------------------------------------------------------------------

class GeometryApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("RapidPassives - Inductor and Transformer Layout Generator")
        self.geometry("1200x700")

        # Define custom fonts
        self.custom_font = tkfont.Font(family="Helvetica", size=12)

        # Apply custom fonts to widget classes
        self.option_add("*TLabel.Font", self.custom_font)
        self.option_add("*Label.Font", self.custom_font)
        self.option_add("*Entry.Font", self.custom_font)
        self.option_add("*Button.Font", self.custom_font)
        self.option_add("*Checkbutton.Font", self.custom_font)
        self.option_add("*TNotebook.Tab.Font", self.custom_font)

        # Create the main frames
        self.left_panel = ttk.Frame(self, width=300)  # Fixed width for the left panel
        self.left_panel.grid(row=0, column=0, sticky="ns")
        self.left_panel.grid_propagate(False)  # Prevent left_panel from resizing

        self.plot_frame = tk.Frame(self)
        self.plot_frame.grid(row=0, column=1, sticky="nsew")

        # Configure grid weights
        self.grid_columnconfigure(0, weight=0)  # Left panel does not expand
        self.grid_columnconfigure(1, weight=1)  # Plot frame expands
        self.grid_rowconfigure(0, weight=1)

        # Create the notebook (tabbed interface) inside the left panel
        self.notebook = ttk.Notebook(self.left_panel)
        self.notebook.pack(fill=tk.BOTH, expand=True)

        # Set the style for the notebook tabs
        style = ttk.Style()
        style.configure("TNotebook.Tab", font=self.custom_font)

        # Create the plot area
        self.fig, self.ax = plt.subplots(figsize=(5, 5), tight_layout=True)
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.plot_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        # Initialize tabs
        self.tabs = {}
        self.create_tabs()

        # Bind tab change event
        self.notebook.bind("<<NotebookTabChanged>>", self.on_tab_change)

        # Select the first tab and generate its geometry
        self.notebook.select(0)
        self.after(100, self.tabs['spiral'].generate_geometry)

    def create_tabs(self):
        # Create instances of each geometry tab
        self.tabs['spiral'] = SpiralTab(self.notebook, self)
        self.tabs['symmetric_inductor'] = SymmetricInductorTab(self.notebook, self)
        self.tabs['symmetric_transformer'] = SymmetricTransformerTab(self.notebook, self)

        # Add tabs to the notebook
        self.notebook.add(self.tabs['spiral'].frame, text='Spiral Inductor')
        self.notebook.add(self.tabs['symmetric_inductor'].frame, text='Symmetric Inductor')
        self.notebook.add(self.tabs['symmetric_transformer'].frame, text='Symmetric Transformer')

    def on_tab_change(self, event):
        selected_tab = event.widget.select()
        tab_text = event.widget.tab(selected_tab, "text")
        tab_key = ''
        if tab_text == 'Spiral Inductor':
            tab_key = 'spiral'
        elif tab_text == 'Symmetric Inductor':
            tab_key = 'symmetric_inductor'
        elif tab_text == 'Symmetric Transformer':
            tab_key = 'symmetric_transformer'

        # Generate geometry for the selected tab
        if tab_key in self.tabs:
            self.tabs[tab_key].generate_geometry()


class GeometryTabBase:
    def __init__(self, parent, app):
        self.app = app
        self.frame = ttk.Frame(parent)
        self.params = []
        self.param_vars = {}
        self.pgs_params = []
        self.pgs_param_vars = {}
        self.geometry_object = None
        self.widgets = {}  # Dictionary to store widgets associated with parameters
        self.initialized = False  # Flag to prevent on_parameter_change during initialization

        self.create_widgets()
        self.bind_events()
        self.initialized = True  # Initialization complete

    def create_widgets(self):
        # To be implemented in subclasses
        pass

    def create_label_entry(self, parent, text, variable, row, param_name):
        label = tk.Label(parent, text=text)
        label.grid(row=row, column=0, sticky=tk.W, padx=5, pady=2)
        if isinstance(variable, tk.BooleanVar):
            widget = tk.Checkbutton(parent, variable=variable)
        else:
            widget = tk.Entry(parent, textvariable=variable)
        widget.grid(row=row, column=1, padx=5, pady=2, sticky=tk.W)
        self.widgets[param_name] = widget

    def create_parameter_frame(self, title, parameters):
        frame = ttk.LabelFrame(self.frame, text=title)
        frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        row = 0
        for param in parameters:
            var = param['var']
            label = param['label']
            name = param['name']
            self.create_label_entry(frame, label, var, row, name)
            row += 1
        return frame

    def create_pgs_frame(self):
        pgs_frame = ttk.LabelFrame(self.frame, text="Patterned Ground Shield")
        pgs_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        add_pgs_var = self.pgs_param_vars['add_pgs']
        add_pgs_check = tk.Checkbutton(pgs_frame, text="Include PGS", variable=add_pgs_var, command=self.update_pgs_state)
        add_pgs_check.grid(row=0, column=0, sticky=tk.W, padx=5, pady=2)
        row = 1
        for param in self.pgs_params:
            name = param['name']
            if name != 'add_pgs':
                var = param['var']
                label = param['label']
                self.create_label_entry(pgs_frame, label, var, row, name)
                row += 1
        return pgs_frame

    def create_export_button(self):
        export_button = tk.Button(self.frame, text="Export to GDS", command=self.export_gds)
        export_button.pack(pady=10)

    def bind_events(self):
        # Add trace to all variables to update geometry on change
        for var in self.param_vars.values():
            var.trace_add('write', self.on_parameter_change)
        for var in self.pgs_param_vars.values():
            var.trace_add('write', self.on_parameter_change)

    def on_parameter_change(self, *args):
        if not self.initialized:
            return
        # Debounce rapid changes
        if hasattr(self, 'after_id'):
            self.frame.after_cancel(self.after_id)
        self.after_id = self.frame.after(400, self.generate_geometry)

    def generate_geometry(self):
        self.app.ax.clear()
        try:
            params = {name: var.get() for name, var in self.param_vars.items()}
            # Convert BooleanVar to bool
            for name, var in self.param_vars.items():
                if isinstance(var, tk.BooleanVar):
                    params[name] = bool(params[name])

            # Create geometry object
            self.create_geometry_object(params)

            # Add PGS if selected
            if self.pgs_param_vars['add_pgs'].get():
                pgs_params = {name: var.get() for name, var in self.pgs_param_vars.items() if name != 'add_pgs'}
                self.geometry_object.add_pgs(**pgs_params)

            # Plot geometry
            self.geometry_object.plot(ax=self.app.ax)
            self.app.ax.set_title(self.geometry_type)
            self.app.canvas.draw()

            # Check validity
            if not self.geometry_object.is_valid():
                messagebox.showwarning("Warning", "Invalid geometry parameters")
                self.app.ax.set_title(f"{self.geometry_type} (Invalid Geometry)")
                self.app.canvas.draw()

        except Exception as e:
            messagebox.showerror("Error", f"An error occurred: {e}")
            self.app.ax.set_title("Error in Geometry")
            self.app.canvas.draw()

    def create_geometry_object(self, params):
        # To be implemented in subclasses
        pass

    def export_gds(self):
        if self.geometry_object is None:
            messagebox.showwarning("Warning", "Please generate a valid geometry before exporting.")
            return
        try:
            file_path = filedialog.asksaveasfilename(defaultextension=".gds", filetypes=[("GDS files", "*.gds")])
            if file_path:
                self.geometry_object.to_gds(file_path)
                messagebox.showinfo("Success", f"GDS file saved to {file_path}")
        except Exception as e:
            messagebox.showerror("Error", f"An error occurred: {e}")

    def update_pgs_state(self):
        state = 'normal' if self.pgs_param_vars['add_pgs'].get() else 'disabled'
        for param_name, var in self.pgs_param_vars.items():
            if param_name != 'add_pgs':
                widget = self.widgets.get(param_name)
                if widget:
                    widget.config(state=state)
        if self.initialized:
            self.on_parameter_change()


class SpiralTab(GeometryTabBase):
    def __init__(self, parent, app):
        self.geometry_type = 'Spiral Inductor'
        super().__init__(parent, app)

    def create_widgets(self):
        self.params = [
            {'name': 'Dout', 'label': 'Outer Diameter', 'var': tk.DoubleVar(value=130)},
            {'name': 'N', 'label': 'Number of Turns', 'var': tk.IntVar(value=3)},
            {'name': 'sides', 'label': 'Number of Sides', 'var': tk.IntVar(value=8)},
            {'name': 'width', 'label': 'Conductor Width', 'var': tk.DoubleVar(value=10)},
            {'name': 'spacing', 'label': 'Conductor Spacing', 'var': tk.DoubleVar(value=4)},
            {'name': 'via_spacing', 'label': 'Via Spacing', 'var': tk.DoubleVar(value=0.8)},
            {'name': 'via_width', 'label': 'Via Width', 'var': tk.DoubleVar(value=1)},
            {'name': 'via_in_metal', 'label': 'Via in Metal', 'var': tk.DoubleVar(value=0.45)}
        ]
        self.param_vars = {param['name']: param['var'] for param in self.params}
        self.pgs_params = [
            {'name': 'add_pgs', 'label': 'Include PGS', 'var': tk.BooleanVar(value=False)},
            {'name': 'D', 'label': 'PGS Outer Diameter', 'var': tk.DoubleVar(value=150)},
            {'name': 'width', 'label': 'PGS Width', 'var': tk.DoubleVar(value=2)},
            {'name': 'spacing', 'label': 'PGS Spacing', 'var': tk.DoubleVar(value=1)}
        ]
        self.pgs_param_vars = {param['name']: param['var'] for param in self.pgs_params}

        self.create_parameter_frame("Parameters", self.params)
        self.create_pgs_frame()
        self.create_export_button()
        self.update_pgs_state()

    def create_geometry_object(self, params):
        self.geometry_object = SpiralInductor(**params)


class SymmetricInductorTab(GeometryTabBase):
    def __init__(self, parent, app):
        self.geometry_type = 'Symmetric Inductor'
        super().__init__(parent, app)

    def create_widgets(self):
        self.params = [
            {'name': 'Dout', 'label': 'Outer Diameter', 'var': tk.DoubleVar(value=250)},
            {'name': 'N', 'label': 'Number of Turns', 'var': tk.IntVar(value=3)},
            {'name': 'sides', 'label': 'Number of Sides', 'var': tk.IntVar(value=8)},
            {'name': 'width', 'label': 'Conductor Width', 'var': tk.DoubleVar(value=16)},
            {'name': 'spacing', 'label': 'Conductor Spacing', 'var': tk.DoubleVar(value=2)},
            {'name': 'via_extent', 'label': 'Via Extent', 'var': tk.DoubleVar(value=8)},
            {'name': 'via_spacing', 'label': 'Via Spacing', 'var': tk.DoubleVar(value=0.8)},
            {'name': 'via_width', 'label': 'Via Width', 'var': tk.DoubleVar(value=1)},
            {'name': 'via_in_metal', 'label': 'Via in Metal', 'var': tk.DoubleVar(value=0.45)},
            {'name': 'center_tap', 'label': 'Center Tap', 'var': tk.BooleanVar(value=False)}
        ]
        self.param_vars = {param['name']: param['var'] for param in self.params}
        self.pgs_params = [
            {'name': 'add_pgs', 'label': 'Include PGS', 'var': tk.BooleanVar(value=False)},
            {'name': 'D', 'label': 'PGS Outer Diameter', 'var': tk.DoubleVar(value=270)},
            {'name': 'width', 'label': 'PGS Width', 'var': tk.DoubleVar(value=4)},
            {'name': 'spacing', 'label': 'PGS Spacing', 'var': tk.DoubleVar(value=2)}
        ]
        self.pgs_param_vars = {param['name']: param['var'] for param in self.pgs_params}

        self.create_parameter_frame("Parameters", self.params)
        self.create_pgs_frame()
        self.create_export_button()
        self.update_pgs_state()

    def create_geometry_object(self, params):
        self.geometry_object = SymmetricInductor(**params)


class SymmetricTransformerTab(GeometryTabBase):
    def __init__(self, parent, app):
        self.geometry_type = 'Symmetric Transformer'
        super().__init__(parent, app)

    def create_widgets(self):
        # Common parameters
        self.params = [
            {'name': 'Dout', 'label': 'Outer Diameter', 'var': tk.DoubleVar(value=400)},
            {'name': 'sides', 'label': 'Number of Sides', 'var': tk.IntVar(value=8)},
            {'name': 'width', 'label': 'Conductor Width', 'var': tk.DoubleVar(value=18)},
            {'name': 'spacing', 'label': 'Conductor Spacing', 'var': tk.DoubleVar(value=6)},
            {'name': 'via_extent', 'label': 'Via Extent', 'var': tk.DoubleVar(value=12)},
            {'name': 'via_spacing', 'label': 'Via Spacing', 'var': tk.DoubleVar(value=0.8)},
            {'name': 'via_width', 'label': 'Via Width', 'var': tk.DoubleVar(value=1)},
            {'name': 'via_in_metal', 'label': 'Via in Metal', 'var': tk.DoubleVar(value=0.45)},
        ]
        self.param_vars = {param['name']: param['var'] for param in self.params}

        # Primary side parameters
        self.primary_params = [
            {'name': 'N1', 'label': 'Primary Turns', 'var': tk.IntVar(value=4)},
            {'name': 'center_tap_primary', 'label': 'Primary Center Tap', 'var': tk.BooleanVar(value=True)}
        ]
        self.param_vars.update({param['name']: param['var'] for param in self.primary_params})

        # Secondary side parameters
        self.secondary_params = [
            {'name': 'N2', 'label': 'Secondary Turns', 'var': tk.IntVar(value=2)},
            {'name': 'center_tap_secondary', 'label': 'Secondary Center Tap', 'var': tk.BooleanVar(value=True)}
        ]
        self.param_vars.update({param['name']: param['var'] for param in self.secondary_params})

        # PGS parameters
        self.pgs_params = [
            {'name': 'add_pgs', 'label': 'Include PGS', 'var': tk.BooleanVar(value=False)},
            {'name': 'D', 'label': 'PGS Outer Diameter', 'var': tk.DoubleVar(value=450)},
            {'name': 'width', 'label': 'PGS Width', 'var': tk.DoubleVar(value=4)},
            {'name': 'spacing', 'label': 'PGS Spacing', 'var': tk.DoubleVar(value=2)}
        ]
        self.pgs_param_vars = {param['name']: param['var'] for param in self.pgs_params}

        # Create widgets
        self.create_parameter_frame("Parameters", self.params)
        self.create_parameter_frame("Primary Side", self.primary_params)
        self.create_parameter_frame("Secondary Side", self.secondary_params)
        self.create_pgs_frame()
        self.create_export_button()
        self.update_pgs_state()

    def create_geometry_object(self, params):
        self.geometry_object = SymmetricTransformer(**params)


if __name__ == "__main__":
    app = GeometryApp()
    app.mainloop()
