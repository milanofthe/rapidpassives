#########################################################################################
##
##                         SPIRAL INDUCTOR LAYOUT GENERATION
##
##                                   Milan Rother
##
#########################################################################################

# imports -------------------------------------------------------------------------------

import matplotlib.pyplot as plt
import numpy as np

import gdstk

from .utils.shapes import via_grid


# generation class ----------------------------------------------------------------------

class SpiralInductor:

    """
    INPUTS:
        Dout         : outer diameter
        N            : number of windings
        sides        : number of sides of polygon (multiples of 2, starting with 4)
        width        : width of conductor
        spacing      : spacing between conductors
        via_spacing  : spacing of vias
        via_width    : width of vias (in via array)
        via_in_metal : disctance of vias to metal edge
        via_merge    : merge vias in via array generation
    """

    def __init__(self,
                 Dout=10, 
                 N=2, 
                 sides=8, 
                 width=0.5, 
                 spacing=0.5, 
                 via_spacing=0.8, 
                 via_width=1,
                 via_in_metal=0.45, 
                 via_merge=False):

        self.Dout = Dout
        self.N = N
        self.sides = sides 
        self.width = width
        self.spacing = spacing 
        self.via_spacing = via_spacing
        self.via_width = via_width
        self.via_in_metal = via_in_metal
        self.via_merge = via_merge

        #verify geometry
        self._check()

        #build polygons
        self._build()


    def _check(self):
        pass


    def _build(self):
        """
        build all the polygons
        """
        
        #width projected to polygon
        v = self.width / np.cos(np.pi/self.sides)
        
        #distance projected to polygon
        s = (self.spacing + self.width) / np.cos(np.pi/self.sides)
        
        #starting radii
        R1 = self.Dout / 2 / np.cos(np.pi/self.sides)
        R2 = R1 - v
        
        #angles
        n_pts = self.sides//2
        angles = np.pi * np.linspace(1/(2*n_pts), 1-1/(2*n_pts) , n_pts)
        
        #extend of crossing due to via grid
        extend = extend = 2 * (self.via_width + self.via_in_metal) + self.via_spacing 

        #shift of center for lower section
        x_shift = - s / 2 * np.cos(np.pi / self.sides)
        y_shift = - s / 2 * np.sin(np.pi / self.sides)
        
        #init polygons
        polys_windings_top = []
        polys_crossings_bottom = []
        
        #initialization of inner and outer paths
        x_out = []
        y_out = []
        
        x_in = []
        y_in = []
        
        #build sections
        for section in range(2 * self.N + 1):
            
            #upper section
            if section % 2 == 0:
                for phi in angles:
                    x_out.append( R1 * np.cos(phi) )
                    x_in.append( R2 * np.cos(phi) )
                    
                    y_out.append( R1 * np.sin(phi) )
                    y_in.append( R2 * np.sin(phi) )
                
            #lower section
            else:
                for phi in angles:
                    x_out.append( -R1 * np.cos(phi) + x_shift  )
                    x_in.append( -R2 * np.cos(phi) + x_shift )
                    
                    y_out.append( -R1 * np.sin(phi) + y_shift )
                    y_in.append( -R2 * np.sin(phi) +  y_shift )
                
            #update radii
            R1 -= s/2
            R2 -= s/2
            
        #start connector
        x_out_start = [self.Dout/2 + self.width, x_out[0]] 
        x_in_start = [self.Dout/2 + self.width, x_in[0]] 
        
        y_out_start = [self.width/2, self.width/2]
        y_in_start = [-self.width/2, -self.width/2]
        
        #end connector
        x_out_end = [x_out[-1]] 
        x_in_end = [x_in[-1]] 
        
        y_out_end = [-self.width/2]
        y_in_end = [-self.width/2]
        
        #under
        if extend > self.width:
            x_under = [x_in[-1], x_in[-1], -(self.Dout/2 + self.width), 
                       -(self.Dout/2 + self.width), x_in[-1]-self.width, x_in[-1]-self.width]
            y_under = [extend-self.width/2, -self.width/2, -self.width/2, 
                       self.width/2, self.width/2, extend-self.width/2]
        else:
            x_under = [ x_in[-1], -(self.Dout/2 + self.width), -(self.Dout/2 + self.width), x_in[-1] ]
            y_under = [ -self.width/2, -self.width/2         , self.width/2          , self.width/2  ]
            
        polys_crossings_bottom.append( (x_under, y_under) )
        
        #vias
        via_center_x = x_out[-1] + (x_in[-1] - x_out[-1])/2
        via_center_y = 0
        
        if extend > self.width:
            polys_vias_t_b = via_grid(via_center_x, via_center_y+(extend-self.width)/2, 
                                      self.width-2*self.via_in_metal, extend-2*self.via_in_metal, 
                                      self.via_spacing, self.via_width, self.via_merge)
        else:
            polys_vias_t_b = via_grid(via_center_x, via_center_y, self.width-2*self.via_in_metal, 
                                      self.width-2*self.via_in_metal, self.via_spacing, self.via_width, 
                                      self.via_merge)
            
        #combine in and out to poly
        x_poly = x_out_start + x_out + x_out_end + x_in_end[::-1] + x_in[::-1] + x_in_start[::-1]
        y_poly = y_out_start + y_out + y_out_end + y_in_end[::-1] + y_in[::-1] + y_in_start[::-1]
        
        polys_windings_top.append( (x_poly, y_poly) )

        #assign polygons to layers
        self.layers = {"windings"  : polys_windings_top, 
                       "crossings" : polys_crossings_bottom, 
                       "vias"      : polys_vias_t_b}


    def to_gds(self, path, add_port_labels=True, unit=1e-6):

        lib = gdstk.Library(unit=unit)

        cell = lib.new_cell("SpiralInductor")

        #add polygons to each layer
        for xx, yy in self.layers["windings"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=1, datatype=0))

        for xx, yy in self.layers["crossings"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=2, datatype=0))

        for xx, yy in self.layers["vias"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=3, datatype=0))


        if add_port_labels:

            x_label = self.Dout/2 + self.width 
            cell.add(gdstk.Label("P1", (x_label, 0.0), "w", layer=1))
            cell.add(gdstk.Label("P2", (-x_label, 0.0), "e", layer=2))


        if not path.endswith(".gds"): path += ".gds"
        lib.write_gds(path)


    def plot(self):

        fig, ax = plt.subplots(tight_layout=True, dpi=120, figsize=(4, 4))

        ax.set_aspect(1)

        for xx, yy in self.layers["windings"]:
            ax.fill(xx, yy, c="gold", alpha=0.4, ec=None)

        for xx, yy in self.layers["crossings"]:
            ax.fill(xx, yy, c="tab:red", alpha=0.4, ec=None)

        for xx, yy in self.layers["vias"]:
            ax.fill(xx, yy, c="k", ec=None)

        ax.set_xlabel("x")
        ax.set_ylabel("y")