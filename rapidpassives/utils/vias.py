#########################################################################################
##
##                       TOOLS FOR AUTOMATIC VIA GENERATION
##
##                                   Milan Rother
##
#########################################################################################

# imports -------------------------------------------------------------------------------

import numpy as np


# vias and via grids --------------------------------------------------------------------

def via(x0, y0, width_x, width_y):
    """
    generate polygons for via geometry

    INPUT:
        x0      : (float) center x-coordinate
        y0      : (float) center y-coordinate
        width_x : (float) width of array in x direction
        width_y : (float) width of array in y direction

    """

    x = [x0+width_x/2, x0+width_x/2, x0-width_x/2, x0-width_x/2]
    y = [y0+width_y/2, y0-width_y/2, y0-width_y/2, y0+width_y/2]

    return [(x, y)]


def via_grid(x0, y0, width_x, width_y, via_spacing=0.8, via_width=1, via_merge=False):
    
    """
    generate geometry of via grid at center 
    position x0, y0 with given width in x and y 
    direction and spacing between vias

    INPUT:
        x0          : (float) center x-coordinate
        y0          : (float) center y-coordinate
        width_x     : (float) width of array in x direction
        width_y     : (float) width of array in y direction
        via_spacing : (float) spacing between vias
        via_width   : (float) width of individual vias
        via_merge   : (bool) merge vias? i.e. for simulation
    
    """
    
    #init polygon list
    polys_via = []
    
    #in case of via merging
    if via_merge:
        return via(x0, y0, width_x, width_y)

    #grid size in x and y direction
    nx = int((width_x + via_spacing) / (via_width + via_spacing))
    ny = int((width_y + via_spacing) / (via_width + via_spacing))
    
    #difference in x and y direction
    diff_x = width_x - nx * via_width - (nx - 1) * via_spacing
    diff_y = width_y - ny * via_width - (ny - 1) * via_spacing
    
    #fill grid
    for i in range(nx):
        x = i * (via_width + via_spacing) - width_x/2 + diff_x/2 + x0
        for j in range(ny):
            y = j * (via_width + via_spacing) - width_y/2 + diff_y/2 + y0
            polys_via.append( ( [x, x+via_width, x+via_width, x], 
                                [y, y, y+via_width, y+via_width] ) )
            
    return polys_via
    
    

    
    
    
