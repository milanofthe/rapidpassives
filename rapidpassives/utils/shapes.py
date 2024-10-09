#########################################################################################
##
##                  TOOLS FOR AUTOMATIC GEOMETRY POLYGON GENERATION
##
##                                   Milan Rother
##
#########################################################################################


# imports -------------------------------------------------------------------------------

import numpy as np
import re


# AUX FUNCTIONS =========================================================================


@np.vectorize
def is_valid(D, N, p, w, s, e=3.6, q=None):

    """
    check if geometry of interleaved inductor and transformer is valid
    in case of trafo: N = N1 + N2
    """

    h = w + s + (np.sqrt(2) - 1) * (2*s + w)
    q = 2 * w + s if q is None else q

    topbridge_ok    = (h + 2*e <= ( D/2 - (N-1) * (w+s)     ) * np.cos(np.pi / p))
    bottombridge_ok = (h       <= ( D/2 - (N-1) * s - N * w ) * np.cos(np.pi / p))
    port_ok         = (q       <=   D/2 * np.cos(np.pi / p))

    return topbridge_ok and bottombridge_ok and port_ok


def minimum_diameter(w_min, s_min, N, p, ext):
    
    """
    compute minimum possible diameter from design rules 
    and geometry restrictions
    """
    
    h = w_min + s_min + (np.sqrt(2) - 1) * (2*s_min + w_min)

    D_min_1 = (h + 2*ext) / (np.sin(np.pi/p) * np.cos(np.pi/p)) + 2 * (N-1) * (w_min + s_min) 
    D_min_2 = h / (np.sin(np.pi/p) * np.cos(np.pi/p)) + 2 * ((N-1) * s_min + N * w_min)
    
    # print(D_min_1, D_min_2)

    return max(D_min_1, D_min_2)


# GEOMETRY FUNCTIONS ====================================================================

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



# bends -----------------------------------------------------------------------------------

def bend_spline(n_pts, w, x0, y0, R, phi):
    
    """
    equal width bend, uses 5th order polynomial 
    fit as path center and then performs coordinate 
    transformation to ensure equal linewidth
        
        n_pts  : number of points on routing path
        w      : width of path (conductor)
        x0     : coordinate center x
        y0     : coordinate center y
        R      : connection radius
        phi    : bend angle
    
    """
    
    #boundary conditions from parameters
    x1 = -R * np.cos(phi/2)
    x2 = R * np.cos(phi/2)
    
    y1  = -R * np.sin(phi/2)
    y2  = -R * np.sin(phi/2)
    dy1 =  np.tan(phi/2)
    dy2 = -np.tan(phi/2)
    ddy1 = 0
    ddy2 = 0
    
    #build equations from boundary conditions
    A = np.array([[ x1**5   , x1**4   , x1**3  , x1**2, x1, 1 ],
                  [ x2**5   , x2**4   , x2**3  , x2**2, x2, 1 ],
                  [ 5*x1**4 , 4*x1**3 , 3*x1**2, 2*x1 , 1 , 0 ],
                  [ 5*x2**4 , 4*x2**3 , 3*x2**2, 2*x2 , 1 , 0 ],
                  [ 20*x1**3, 12*x1**2, 6*x1   , 2    , 0 , 0 ],
                  [ 20*x2**3, 12*x2**2, 6*x2   , 2    , 0 , 0 ]])
    
    B = np.array([ y1, y2, dy1, dy2, ddy1, ddy2 ])
    
    #solve for polynomial coefficients 
    a, b, c, d, e, ff = np.linalg.solve(A, B)
    
    #path initialization
    x_upper = []
    y_upper = []
    x_lower = []
    y_lower = []
    
    #iterate points
    for i in range(n_pts):
        x = x1 + i * (x2 - x1) / (n_pts - 1)
        
        #path and derivative
        f  = a*x**5 + b*x**4 + c*x**3 + d*x**2 + e*x + ff
        df = 5*a*x**4 + 4*b*x**3 + 3*c*x**2 + 2*d*x + e
        
        #norm of derivative
        df_norm = np.sqrt(1 + df**2)
        
        #append points after transform
        x_upper.append( -w/2 * df / df_norm + x)
        y_upper.append( w/2 / df_norm + f)
        x_lower.append( w/2 * df / df_norm + x)
        y_lower.append( -w/2 / df_norm + f)
    
    #combine upper and lower path to polygon
    x_poly = x_upper + x_lower[::-1]
    y_poly = y_upper + y_lower[::-1]
    
    #rotation
    x_rot = [ np.cos(-phi/2)*x - np.sin(-phi/2)*y for x, y in zip(x_poly, y_poly)]
    y_rot = [ np.sin(-phi/2)*x + np.cos(-phi/2)*y for x, y in zip(x_poly, y_poly)]
    
    #translation
    x_poly = [x + x0 for x in x_rot]
    y_poly = [y + y0 for y in y_rot]
    
    return x_poly, y_poly



# routing ---------------------------------------------------------------------------------

def routing_geometric(w, dx, dy, x0, y0, extend=0):
    
    """
    equal width routing of parallel offset lines,
    geometrically constructed bend to ensure 
    equal linewidth
        
        w      : width of path (conductor)
        dx     : offset of lines in x-direction
        dy     : offset of lines in y-direction
        x0     : coordinate center x
        y0     : coordinate center y
        extend : extend routing in both directions?
    
    """
    
    #compute geometric parameters
    s = 2 * dy - w
    h = 2 * dx
    
    #compute offsets 
    g = (( 2 * h * s * (s + w) - np.sqrt( h**2 * s**2 * 4 * (s + w)**2 
           - 4 * s**2 * (s + w)**2 * ( 3*s**2 + 4*s*w + w**2 ) ) ) 
           / ( 3*s**2 + 4*s*w + w**2 ) / 2 )
    d = g * w/s
    
    #path initialization
    x_upper = [-dx, -dx+g, dx-g-d, dx]
    y_upper = [-s/2, -s/2, s/2+w, s/2+w]
    x_lower = [-dx, -dx+g+d, dx-g,  dx]
    y_lower = [-s/2-w, -s/2-w, s/2, s/2]
    
    #extend to left and right
    if extend > 0:
        x_upper = [-dx-extend] + x_upper + [dx+extend]
        y_upper = [-s/2] + y_upper + [s/2+w]
        x_lower = [-dx-extend] + x_lower + [dx+extend]
        y_lower = [-s/2-w] + y_lower + [s/2]
        
    #construct polygon
    x_poly = x_upper + x_lower[::-1]
    y_poly = y_upper + y_lower[::-1]
    
    #translation
    x_poly = [x + x0 for x in x_poly]
    y_poly = [y + y0 for y in y_poly]
    
    return x_poly, y_poly
    


def routing_geometric_45(w, s, x0, y0, extend=0):
    
    """
    equal width routing of parallel offset lines,
    geometrically constructed bend to ensure 
    equal linewidth
        
        w      : width of path (conductor)
        dx     : offset of lines in x-direction
        dy     : offset of lines in y-direction
        x0     : coordinate center x
        y0     : coordinate center y
        extend : extend routing in both directions?
    
    """
    
    #compute geometric parameters
    g = (np.sqrt(2) - 1) * s
    d = (np.sqrt(2) - 1) * w
    h = w + s + (np.sqrt(2) - 1) * (2*s + w)
    
    #path initialization
    x_upper = [-h/2, -h/2+g, h/2-g-d, h/2]
    y_upper = [-s/2, -s/2, s/2+w, s/2+w]
    x_lower = [-h/2, -h/2+g+d, h/2-g,  h/2]
    y_lower = [-s/2-w, -s/2-w, s/2, s/2]
    
    #extend to left and right
    if extend > 0:
        x_upper = [-h/2-extend] + x_upper + [h/2+extend]
        y_upper = [-s/2] + y_upper + [s/2+w]
        x_lower = [-h/2-extend] + x_lower + [h/2+extend]
        y_lower = [-s/2-w] + y_lower + [s/2]
        
    #construct polygon
    x_poly = x_upper + x_lower[::-1]
    y_poly = y_upper + y_lower[::-1]
    
    #translation
    x_poly = [x + x0 for x in x_poly]
    y_poly = [y + y0 for y in y_poly]
    
    return x_poly, y_poly
    


def routing_spline(n_pts, w, dx, dy, x0, y0, extend=0):
    
    """
    equal width routing of parallel offset lines,
    uses 5th order polynomial fit as path center 
    and then performs coordinate transformation 
    to ensure equal linewidth
        
        n_pts  : number of points on routing path
        w      : width of path (conductor)
        dx     : offset of lines in x-direction
        dy     : offset of lines in y-direction
        x0     : coordinate center x
        y0     : coordinate center y
        extend : extend routing both directions
    
    """
    
    #fitting coefficients
    a = 3 * dy / dx**5 / 8
    c = -5 * dy / dx**3 / 4
    e = 15 * dy / dx / 8
    
    #derivative fitting coefficients
    da = 15 * dy / dx**5 / 8
    dc = -15 * dy / dx**3 / 4
    de = 15 * dy / dx / 8
    
    #path initialization
    x_upper = []
    y_upper = []
    x_lower = []
    y_lower = []
    
    #iterate points
    for i in range(n_pts):
        x = -dx + i * 2 * dx / (n_pts-1)
        
        #path and derivative
        f  = a*x**5 + c*x**3 + e*x
        df = da*x**4 + dc*x**2 + de
        
        #norm of derivative
        df_norm = np.sqrt(1 + df**2)
        
        #append points after transform
        x_upper.append( -w/2 * df / df_norm + x + x0)
        y_upper.append( w/2 / df_norm + f + y0 )
        x_lower.append( w/2 * df / df_norm + x + x0 )
        y_lower.append( -w/2 / df_norm + f + y0)
        
    #build polygon from upper and lower
    if extend > 0:
        x_poly = [x0 - dx - extend] + x_upper + [x0 + dx + extend, x0 + dx + extend] + x_lower[::-1] + [x0 - dx - extend]
        y_poly = [y0 - dy + w/2] + y_upper + [y0 + dy + w/2, y0 + dy - w/2] + y_lower[::-1] + [y0 - dy - w/2]
    else:
        x_poly = x_upper + x_lower[::-1]
        y_poly = y_upper + y_lower[::-1]
    
    return x_poly, y_poly



# guard ring etc. -------------------------------------------------------------------------

def guard_ring(Din, w, via_spacing, via_width, via_in_metal, gap_top=0, gap_bottom=0, gap_left=0, gap_right=0):
    
    """
    generate geometry for square guard ring
        
        Din          : inner diameter of guard ring
        w            : width of guard ring
        via_spacing  : spacing in between vias
        via_width    : width of vias
        via_in_metal : distance of vias to edge of metal
        gap_top      : gap in guard ring at top
        gap_bottom   : gap in guard ring at bottom
        gap_left     : gap in guard ring at left
        gap_right    : gap in guard ring at right
        
    """
    
    
    Rin = Din/2
    
    #init polygon lists
    sections_top = []
    vias         = []
    
    
    #top left section
    x = [ -Rin, -Rin, -gap_top/2, -gap_top/2, -Rin-w, -Rin-w ]
    y = [ gap_left/2, Rin, Rin, Rin+w, Rin+w, gap_left/2 ]
    
    sections_top.append( (x, y) )
    
    #top right section
    x = [ Rin, Rin, gap_top/2, gap_top/2, Rin+w, Rin+w ]
    y = [ gap_right/2, Rin, Rin, Rin+w, Rin+w, gap_right/2 ]
    
    sections_top.append( (x, y) )
    
    #bottom left section
    x = [ -Rin, -Rin, -gap_bottom/2, -gap_bottom/2, -Rin-w, -Rin-w ]
    y = [ -gap_left/2, -Rin, -Rin, -Rin-w, -Rin-w, -gap_left/2 ]
    
    sections_top.append( (x, y) )
    
    #bottom right section
    x = [ Rin, Rin, gap_bottom/2, gap_bottom/2, Rin+w, Rin+w ]
    y = [ -gap_right/2, -Rin, -Rin, -Rin-w, -Rin-w, -gap_right/2 ]
    
    sections_top.append( (x, y) )
    
    #vias
    # ...
    
    return sections_top, vias
    


def embedding_inductor(Din=50, Dout=100, width=1, spacing=1, bridge=False, centertap=False):

    """
    geometric embedding of inductor without center tap for simulation

    INPUTS:
        Din       : (float) diameter of device
        Dout      : (float) outer diameter of embedding
        width     : (float) conductor width
        spacing   : (float) conductor spacing
        bridge    : (bool) include bridge between feed lines
        centertap : (bool) include centertap

    """ 

    w = width
    s = spacing

    Rin  = Din/2
    Rout = Dout/2

    #init polygon lists
    sections = []

    #left part
    if centertap:
        xx = [0, -Rout, -Rout, -w/2-s, -w/2-s, -3*w/2-s, -3*w/2-s, -Rout+w, -Rout+w, 0 ]
        yy = [Rout, Rout, -Rout, -Rout, -Rin-s, -Rin-s, -Rout+w, -Rout+w, Rout-w, Rout-w]

    else:
        xx = [0, -Rout, -Rout, -s/2, -s/2, -s/2-w, -s/2-w, -Rout+w, -Rout+w, 0 ]
        yy = [Rout, Rout, -Rout, -Rout, -Rin-s, -Rin-s, -Rout+w, -Rout+w, Rout-w, Rout-w]

    sections.append( (xx, yy) )
    sections.append( ([-x for x in xx], yy) )

    #feed line for centertap with bridge
    if centertap:
        x = [-w/2-s, w/2+s, w/2+s, w/2, w/2, -w/2, -w/2, -w/2-s]
        y = [-Rin-2*s-w, -Rin-2*s-w, -Rin-2*s, -Rin-2*s, -Rin-s, -Rin-s, -Rin-2*s, -Rin-2*s]

        sections.append( (x, y) )

    #add bridge
    elif bridge:
        x = [-s/2, -s/2, s/2, s/2]
        y = [-Rin-2*s, -Rin-2*s-w, -Rin-2*s-w, -Rin-2*s]

        sections.append( (x, y) )

    return sections



def embedding_transformer(Din=50, Dout=100, width=1, spacing=1, bridge=False, center_tap_secondary=False, center_tap_primary=False):

    """
    geometric embedding of transformer without center tap for simulation

    INPUTS:
        Din                  : (float) diameter of device
        Dout                 : (float) outer diameter of embedding
        width                : (float) conductor width
        spacing              : (float) conductor spacing
        bridge               : (bool)  include bridge between feed lines
        center_tap_secondary : (bool)  include feed line for center tap
        center_tap_primary   : (bool)  include feed line for center tap

    """ 

    w = width
    s = spacing

    Rin  = Din/2
    Rout = Dout/2

    #init polygon lists
    sections = []

    #top part
    xx = [-Rout, -Rout, -s/2 , -s/2  , -s/2-w, -s/2-w , -Rout+w, -Rout+w]
    yy = [0    , -Rout, -Rout, -Rin-s, -Rin-s, -Rout+w, -Rout+w, 0      ]
    x_ct = [-Rout, -Rout, -w/2-s , -w/2-s  , -3*w/2-s, -3*w/2-s, -Rout+w, -Rout+w]
    y_ct = [0    , -Rout, -Rout, -Rin-s, -Rin-s, -Rout+w, -Rout+w, 0      ]
    
    if center_tap_secondary:
        sections.append( (x_ct, [-y for y in y_ct]) )
        sections.append( ([-x for x in x_ct], [-y for y in y_ct]) )

        xx = [-w/2-s, -w/2-s, -w/2, -w/2, w/2, w/2, w/2+s, w/2+s]
        yy = [Rin+2*s+w, Rin+2*s, Rin+2*s, Rin+s, Rin+s, Rin+2*s, Rin+2*s, Rin+2*s+w]

        sections.append( (xx, yy) )
        
    else:
        sections.append( (xx, [-y for y in yy]) )
        sections.append( ([-x for x in xx], [-y for y in yy]) )

        if bridge:
            xx = [-s/2, -s/2, s/2, s/2]
            yy = [-Rin-2*s, -Rin-2*s-w, -Rin-2*s-w, -Rin-2*s]

            sections.append( (xx, [-y for y in yy]) )

    #bottom part
    xx = [-Rout, -Rout, -s/2 , -s/2  , -s/2-w, -s/2-w , -Rout+w, -Rout+w]
    yy = [0    , -Rout, -Rout, -Rin-s, -Rin-s, -Rout+w, -Rout+w, 0      ]
    x_ct = [-Rout, -Rout, -w/2-s , -w/2-s  , -3*w/2-s, -3*w/2-s, -Rout+w, -Rout+w]
    y_ct = [0    , -Rout, -Rout, -Rin-s, -Rin-s, -Rout+w, -Rout+w, 0      ]

    if center_tap_primary:
        sections.append( (x_ct, y_ct) )
        sections.append( ([-x for x in x_ct], y_ct) )

        xx = [-w/2-s, -w/2-s, -w/2, -w/2, w/2, w/2, w/2+s, w/2+s]
        yy = [Rin+2*s+w, Rin+2*s, Rin+2*s, Rin+s, Rin+s, Rin+2*s, Rin+2*s, Rin+2*s+w]

        sections.append( (xx, [-y for y in yy]) )

    else:
        sections.append( (xx, yy) )
        sections.append( ([-x for x in xx], yy) )

        if bridge:
            xx = [-s/2, -s/2, s/2, s/2]
            yy = [-Rin-2*s, -Rin-2*s-w, -Rin-2*s-w, -Rin-2*s]

            sections.append( (xx, yy) )
        
    return sections





# vias and via grids ----------------------------------------------------------------------


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
    
    

    
    
    
