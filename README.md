# RapidPassives - DRC clean RFIC Inductors and Transformers

RapidPassives is a tool for generating GDS files for RFIC inductors and transformers with arbitrary numbers of windings and winding ratios. In addition to the geometry generators, checker methods are implemented that ensure a valid geometry without clipping or overlap.

## Spiral Inductors


```python
from rapidpassives import SpiralInductor

#instantiate the inductor for some geometry parameters
Ind = SpiralInductor(
    Dout=122,           # outer diameter 
    N=3,                # number of windings 
    sides=8,            # number of winding sides (8 -> octagonal)
    width=10,           # conductor width
    spacing=4,          # conductor spacing
    via_spacing=0.8,    # spacing between vias in via array
    via_width=1,        # width of vias in via array
    via_in_metal=0.45)  # distance of vias to metal edge

#plot the geometry
Ind.plot()

#export as gds file
Ind.to_gds("examples/spiralinductor.gds")
```


    
![png](README_files/README_3_0.png)
    


## Symmetric Inductors


```python
from rapidpassives import SymmetricInductor

#instantiate the inductor for some geometry parameters
Ind = SymmetricInductor(
    Dout=250,           # outer diameter
    N=3,                # number of windings
    sides=8,            # number of winding sides (8 -> octagonal)
    width=16,           # conductor width
    spacing=2,          # conductor spacing
    center_tap=False,   # include center tap
    via_extent=8,      # size of the via arrays for crossings
    via_spacing=0.8,    # spacing between vias in via array
    via_width=1,        # width of vias
    via_in_metal=0.45)  # distance of vias to metal edge

#plot the geometry
Ind.plot()

#export as gds file
Ind.to_gds("examples/symmetricinductor.gds")
```


    
![png](README_files/README_5_0.png)
    


## Symmetric interleaved Transformers


```python
from rapidpassives import SymmetricTransformer

#instantiate the transformer for some geometry parameters
Trf = SymmetricTransformer(
    Dout=200,                    # outer diameter
    N1=2,                        # number of primary side windings
    N2=3,                        # number of secondary side windings
    sides=8,                     # numer of winding sides (8 -> octagonal)
    width=12,                    # conductor width
    spacing=2,                   # conductor spacing
    center_tap_primary=True,     # include primary side center tap
    center_tap_secondary=False,  # include secondary side center tap
    via_extent=8,                # size of the via arrays for crossings
    via_spacing=0.8,             # spacing between vias in via array
    via_width=1,                 # width of vias
    via_in_metal=0.45)           # distance of vias to metal edge

#plot the geometry
Trf.plot()

#export as gds file
Trf.to_gds("examples/symmetrictransformer.gds")
```


    
![png](README_files/README_7_0.png)
    



```python

```
