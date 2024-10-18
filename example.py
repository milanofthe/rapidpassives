
import matplotlib.pyplot as plt

from rapidpassives import SpiralInductor, SymmetricInductor, SymmetricTransformer

#instantiate the inductor for some geometry parameters
Ind = SpiralInductor(
    Dout=130,           # outer diameter 
    N=3,                # number of windings 
    sides=8,            # number of winding sides (8 -> octagonal)
    width=10,           # conductor width
    spacing=4,          # conductor spacing
    via_spacing=0.8,    # spacing between vias in via array
    via_width=1,        # width of vias in via array
    via_in_metal=0.45)  # distance of vias to metal edge

#add a patterned ground shield
Ind.add_pgs(D=150,      # outer diameter of pgs
            width=2,    # pgs conductor width
            spacing=1)  # pgs conductor spacing

#plot the geometry
Ind.plot()

#export as gds file
Ind.to_gds("examples/spiralinductor.gds")


#instantiate the inductor for some geometry parameters
Ind = SymmetricInductor(
    Dout=250,           # outer diameter
    N=3,                # number of windings
    sides=8,            # number of winding sides (8 -> octagonal)
    width=16,           # conductor width
    spacing=2,          # conductor spacing
    center_tap=False,   # include center tap
    via_extent=8,       # size of the via arrays for crossings
    via_spacing=0.8,    # spacing between vias in via array
    via_width=1,        # width of vias
    via_in_metal=0.45)  # distance of vias to metal edge

#add a patterned ground shield
Ind.add_pgs(D=270,      # outer diameter of pgs
            width=4,    # pgs conductor width
            spacing=2)  # pgs conductor spacing

#plot the geometry
Ind.plot()

#export as gds file
Ind.to_gds("examples/symmetricinductor.gds")


#instantiate the transformer for some geometry parameters
Trf = SymmetricTransformer(
    Dout=400,                    # outer diameter
    N1=5,                        # number of primary side windings
    N2=1,                        # number of secondary side windings
    sides=8,                     # numer of winding sides (8 -> octagonal)
    width=18,                    # conductor width
    spacing=6,                   # conductor spacing
    center_tap_primary=True,     # include primary side center tap
    center_tap_secondary=True,   # include secondary side center tap
    via_extent=12,               # size of the via arrays for crossings
    via_spacing=0.8,             # spacing between vias in via array
    via_width=1,                 # width of vias
    via_in_metal=0.45)           # distance of vias to metal edge

#add a patterned ground shield
Trf.add_pgs(D=450,      # outer diameter of pgs
            width=4,    # pgs conductor width
            spacing=2)  # pgs conductor spacing

#plot the geometry
Trf.plot()

#export as gds file
Trf.to_gds("examples/symmetrictransformer.gds")

plt.show()

