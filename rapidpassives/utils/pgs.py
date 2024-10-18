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
    even configuration with shorted fingers
        
        D : diameter
        w : conductor width
        s : conductor spacing
    
    """
    
    x_left  = np.arange(s/2, D/2, w+s)
    x_right = np.arange(w+s/2, D/2, w+s)

    y_left  = -x_left - np.sqrt(2)/2 * w 
    y_right = -x_right - np.sqrt(2)/2 * w 

    sections = []

    for xl, xr, yl, yr in zip(x_left, x_right, y_left, y_right):

        #check if needs skipping
        if xl > D/2 or xr > D/2 or yl < -D/2 or yr < -D/2:
            continue

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

    #shorts
    s_x = [D/2, D/2-w/np.sqrt(2), 0, 0, w/np.sqrt(2), D/2]
    s_y = [D/2, D/2, w/np.sqrt(2), 0, 0, D/2-w/np.sqrt(2)]

    sections.append( (s_x, s_y) )
    sections.append( ([-x for x in s_x], s_y) )
    sections.append( ([-x for x in s_x], [-y for y in s_y]) )
    sections.append( (s_x, [-y for y in s_y]) )

    return sections