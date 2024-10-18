#########################################################################################
##
##                  TOOLS FOR AUTOMATIC GEOMETRY POLYGON GENERATION
##
##                                   Milan Rother
##
#########################################################################################

# imports -------------------------------------------------------------------------------

import numpy as np


# bends ---------------------------------------------------------------------------------

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
