#########################################################################################
##
##                  TOOLS FOR AUTOMATIC PATTERNED GROUND SHIELD GENERATION
##
##                                   Milan Rother
##
#########################################################################################


# imports -------------------------------------------------------------------------------

import numpy as np


# ground shielding ----------------------------------------------------------------------

def pgs1(D, w, s):
    
    """
    patterned ground shield for inductors and trafos
    odd configuration
        
        D : diameter
        w : conductor width
        s : conductor spacing
    
    """
    
    x_left  = np.arange(s + w/2, D/2, w+s)
    x_right = np.arange(s+3*w/2, D/2, w+s)
    
    y_left  = - x_left - np.sqrt(2)/2 * s 
    y_right = - x_right - np.sqrt(2)/2 * s 
    
    #init polygon list
    sections = []
    
    xx = [ -w/2, -w/2, 0, w/2, w/2]
    yy = [ -D/2, -w/2 - np.sqrt(2)/2 * s, - np.sqrt(2)/2 * s,-w/2 - np.sqrt(2)/2 * s , -D/2 ] 
    
    xx_m = [ w/2, w/2, 0, -w/2, -w/2]
    yy_m = [ D/2, w/2+np.sqrt(2)/2*s, np.sqrt(2)/2*s, w/2+np.sqrt(2)/2*s, D/2 ]
    
    sections.append( ( yy, xx ) )
    sections.append( ( xx, yy ) )
    sections.append( ( yy_m, xx ) )
    sections.append( ( xx, yy_m ) )
    
    for xl, xr, yl, yr in zip(x_left, x_right, y_left, y_right):
        
        xx = [xl, xl, xr, xr]
        yy = [yl, -D/2, -D/2, yr]
        
        xx_m = [-xl, -xl, -xr, -xr]
        yy_m = [-yl, D/2, D/2, -yr]
        
        sections.append( ( yy, xx ) )
        sections.append( ( yy_m, xx ) )
        sections.append( ( yy, xx_m ) )
        sections.append( ( yy_m, xx_m ) )
        
        sections.append( ( xx, yy ) )
        sections.append( ( xx_m, yy ) )
        sections.append( ( xx, yy_m ) )
        sections.append( ( xx_m, yy_m ) )
        
    return sections



def pgs2(D, w, s):
    
    """
    patterned ground shield for inductors and trafos
    even configuration
        
        D : diameter
        w : conductor width
        s : conductor spacing
    
    """
    
    x_left  = np.arange(s/2, D/2, w+s)
    x_right = np.arange(w+s/2, D/2, w+s)
    
    y_left  = - x_left - np.sqrt(2)/2 * s 
    y_right = - x_right - np.sqrt(2)/2 * s 
    
    sections = []
    
    for xl, xr, yl, yr in zip(x_left, x_right, y_left, y_right):

        xx = [xl, xl, xr, xr]
        yy = [yl, -D/2, -D/2, yr]

        xx_m = [-xl, -xl, -xr, -xr]
        yy_m = [-yl, D/2, D/2, -yr]

        sections.append( ( yy, xx ) )
        sections.append( ( yy_m, xx ) )
        sections.append( ( yy, xx_m ) )
        sections.append( ( yy_m, xx_m ) )

        sections.append( ( xx, yy ) )
        sections.append( ( xx_m, yy ) )
        sections.append( ( xx, yy_m ) )
        sections.append( ( xx_m, yy_m ) )
        
    return sections



def pgs3(D, w, s):
    
    """
    patterned ground shield for inductors and trafos
    even configuration with centers connected
        
        D : diameter
        w : conductor width
        s : conductor spacing
    
    """
    
    x_left  = np.arange(s/2, D/2, w+s)
    x_right = np.arange(w+s/2, D/2, w+s)
    
    y_left  = - x_left 
    y_right = - x_right
    
    sections = []
    
    for xl, xr, yl, yr in zip(x_left, x_right, y_left, y_right):

        xx = [xl, xl, xr, xr]
        yy = [yl, -D/2, -D/2, yr]

        xx_m = [-xl, -xl, -xr, -xr]
        yy_m = [-yl, D/2, D/2, -yr]

        sections.append( ( yy, xx ) )
        sections.append( ( yy_m, xx ) )
        sections.append( ( yy, xx_m ) )
        sections.append( ( yy_m, xx_m ) )

        sections.append( ( xx, yy ) )
        sections.append( ( xx_m, yy ) )
        sections.append( ( xx, yy_m ) )
        sections.append( ( xx_m, yy_m ) )
        
    return sections


def pgs4(D, w, s):

    """
    patterned ground shield for inductors and trafos
    Manhattan (90-degree-only) fishbone configuration

        D : diameter
        w : conductor width
        s : conductor spacing

    A central vertical spine carries horizontal fingers on both sides, filling
    a square of side D. The topology is a tree (no closed conductive loops), so
    induced eddy currents are still broken, while every corner is a right angle.
    This avoids the acute (45-degree) and degenerate intersections of the radial
    pattern that fail foundry DRC (e.g. IHP SG13G2 / SG13CMOS5L).
    """

    R = D / 2
    pitch = w + s

    sections = []

    # central vertical spine, spanning the full square height
    sections.append( ( [-w/2, -w/2, w/2, w/2], [-R, R, R, -R] ) )

    # horizontal fingers, centered on multiples of the pitch, spanning the full width
    k_max = int(np.floor((R - w/2) / pitch))
    for k in range(-k_max, k_max + 1):
        y_c = k * pitch
        y_b, y_t = y_c - w/2, y_c + w/2
        sections.append( ( [-R, -R, R, R], [y_b, y_t, y_t, y_b] ) )

    return sections