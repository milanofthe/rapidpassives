import matplotlib.pyplot as plt
import numpy as np

import gdstk

from .utils.vias import via_grid
from .utils.routings import routing_geometric_45
from .utils.pgs import pgs4


class SymmetricTransformer:

    """
    INPUTS:
        Dout                 : outer diameter
        N1                   : number of primary side windings
        N2                   : number of secondary side windings
        sides                : number of sides of polygon (multiples of 2, starting with 4)
        width                : width of conductor
        spacing              : spacing between conductors
        center_tap_primary   : include center tap for primary side?
        center_tap_secondary : include center tap for secondary side?
        via_extent           : extent of via array for transitions
        via_spacing          : spacing of vias
        via_width            : width of vias (in via array)
        via_in_metal         : disctance of vias to metal edge
        via_merge            : merge vias in via array generation
    """

    def __init__(self,
                 Dout=100, 
                 N1=2, 
                 N2=1, 
                 sides=8, 
                 width=5, 
                 spacing=2.4,
                 center_tap_primary=False, 
                 center_tap_secondary=False,
                 via_extent=7, 
                 via_spacing=0.8, 
                 via_width=1,
                 via_in_metal=0.45, 
                 via_merge=False):

        self.Dout = Dout
        self.N1 = N1
        self.N2 = N2
        self.sides = sides 
        self.width = width
        self.spacing = spacing 
        self.center_tap_primary = center_tap_primary 
        self.center_tap_secondary = center_tap_secondary 
        self.via_extent = via_extent
        self.via_spacing = via_spacing
        self.via_width = via_width
        self.via_in_metal = via_in_metal
        self.via_merge = via_merge

        #build polygons
        self._build()


    def is_valid(self):
        """
        check if geometry of interleaved trafo is valid
        """

        N = self.N1 + self.N2

        h = self.width + self.spacing + (np.sqrt(2) - 1) * (2*self.spacing + self.width)
        q = 2 * self.width + self.spacing # spacing for ports
        e = self.via_extent

        topbridge_ok = (h + 2*e <= ( self.Dout/2 - (N - 1) * (self.width + self.spacing)) * np.cos(np.pi / self.sides))
        if not topbridge_ok:
            return False

        bottombridge_ok = (h <= (self.Dout/2 - (N - 1) * self.spacing - N * self.width ) * np.cos(np.pi / self.sides))
        if not bottombridge_ok:
            return False

        port_ok = (q <= self.Dout/2 / np.cos(np.pi / self.sides))
        if not port_ok:
            return False

        #some error checking
        if self.center_tap_secondary and self.center_tap_primary and N % 2 != 0:
            return False


    def add_pgs(self, D, width, spacing):
        """
        add patterned ground shield to the geometry
        """
        self.layers["pgs"] = pgs4(D, width, spacing)


    def _build(self):
        """
        build all the polygons
        """

        #total number of windings
        N = self.N1  + self.N2 
        
        #min windings
        Nmin = min(self.N1 , self.N2 )
        
        #effective end points of windings
        N1_end = N-1 if self.N1  > self.N2  else N-abs(self.N1 -self.N2 )-1
        N2_end = N-1 if self.N1  < self.N2  else N-abs(self.N1 -self.N2 )-1
        
        #width projected to polygon
        v = self.width / np.cos(np.pi/self.sides)
        
        #winding distance projected to polygon
        s = (self.spacing + self.width) / np.cos(np.pi/self.sides) 
        
        #starting radii
        R1 = self.Dout / 2 / np.cos(np.pi/self.sides) 
        R2 = R1 - v
        
        #angles
        upper_left_angles  = [np.pi * ( 0.5 + (i + 0.5) * 2 / self.sides) for i in range(self.sides//4)]
        upper_right_angles = [np.pi * ( 0 + (i + 0.5) * 2 / self.sides) for i in range(self.sides//4)]
        lower_left_angles  = [np.pi * ( 1 + (i + 0.5) * 2 / self.sides) for i in range(self.sides//4)]
        lower_right_angles = [np.pi * ( 1.5 + (i + 0.5) * 2 / self.sides) for i in range(self.sides//4)]
        
        #crossover calculations
        extend = self.via_extent
        sep_total = self.width + self.spacing + (np.sqrt(2) - 1) * (2*self.spacing + self.width)

        #via center collection
        via_centers_t_b  = []
        via_centers_t_ct = []
        
        #where are the crossings?
        top_bridge_windings       = []
        bottom_bridge_windings    = []
        top_crossing_windings     = []
        bottom_crossing_windings  = []
        
        if self.N2 %2==0:
            #N2 ends top
            top_bridge_windings.append(N2_end)
            
            if self.N1 %2==0:
                #N1 ends bottom
                bottom_bridge_windings.append(N1_end)
                if self.N1  >= self.N2 :
                    top_crossing_windings += [w for w in range(N) if w%2!=0 and 0 < w < Nmin*2-1]
                    top_crossing_windings += [w for w in range(N) if w%2==0 and  N > w > Nmin*2-1]
                    bottom_crossing_windings += [w for w in range(N) if w%2!=0 and w < N-1]
                else:
                    bottom_crossing_windings += [w for w in range(N) if w%2!=0 and 0 < w < Nmin*2-1]
                    bottom_crossing_windings += [w for w in range(N) if w%2==0 and  N > w > Nmin*2-1]
                    top_crossing_windings += [w for w in range(N) if w%2!=0 and w < N-1]
            else:
                #N1 ends top
                top_bridge_windings.append(N1_end)
                
                top_crossing_windings += [w for w in range(N) if w%2!=0 and 0 < w < Nmin*2-1]
                top_crossing_windings += [w for w in range(N) if w%2==0 and N-1 > w > Nmin*2-1]
                bottom_crossing_windings += [w for w in range(N) if w%2!=0 and w < N]
                
        else:
            #N2 ends bottom
            bottom_bridge_windings.append(N2_end)
            
            if self.N1 %2==0:
                #N1 ends bottom
                bottom_bridge_windings.append(N1_end)
                
                top_crossing_windings += [w for w in range(N) if w%2!=0 and 0 < w < N-1]
                bottom_crossing_windings += [w for w in range(N) if w%2==0 and N-1 > w > Nmin*2-1]
                bottom_crossing_windings += [w for w in range(N) if w%2!=0 and w < Nmin*2-1]
                
            else:
                #N1 ends top
                top_bridge_windings.append(N1_end)
                
                if self.N1  >= self.N2 :
                    # top_crossing_windings += [w for w in range(N) if w%2!=0 and N-1 > w > Nmin*2-1 ]
                    top_crossing_windings += [w for w in range(N) if w%2!=0 and w < N-1  ]
                    bottom_crossing_windings += [w for w in range(N) if w%2!=0 and w < Nmin*2-1 ]
                    bottom_crossing_windings += [w for w in range(N) if w%2==0 and N-1 > w > Nmin*2-1 ]
                else:
                    top_crossing_windings += [w for w in range(N) if w%2==0 and N-1 > w > Nmin*2-1 ]
                    top_crossing_windings += [w for w in range(N) if w%2!=0 and w < Nmin*2-1 ]
                    bottom_crossing_windings += [w for w in range(N) if w%2!=0 and w < Nmin*2  ]
                    bottom_crossing_windings += [w for w in range(N) if w%2!=0 and N-1 > w > Nmin*2-1 ]
                    
        leftright_bridge_windings   = [ w-1 for w in range(1, N+1) if w>2*Nmin ]
        leftright_crossing_windings = [ w-1 for w in range(1, N+1) if w%2!=0 and w<2*Nmin ]
        
        #initialization of polygon lists
        polys_top_windings     = []
        polys_bottom_crossings = []
        polys_center_tap       = []
        polys_vias_t_b         = []
        polys_vias_t_ct        = []
        
        #polygons of windings
        for winding in range(N):
            for i, angs in enumerate([upper_left_angles, lower_left_angles, 
                                      upper_right_angles, lower_right_angles]):
                
                x_out = []
                y_out = []
                
                x_in = []
                y_in = []
                
                for phi in angs:
                    x_out.append( R1 * np.cos(phi) )
                    y_out.append( R1 * np.sin(phi) )
                    
                    x_in.append( R2 * np.cos(phi) )
                    y_in.append( R2 * np.sin(phi) )
                    
                if i == 0:
                    y_out = [y_out[0]] + y_out + [sep_total/2]
                    y_in  = [y_in[0]] + y_in + [sep_total/2]
                    
                    x_out = [-sep_total/2] + x_out + [x_out[-1]]
                    x_in  = [-sep_total/2] + x_in + [x_in[-1]]
                
                elif i == 1:
                    y_out = [-sep_total/2] + y_out + [y_out[-1]]
                    y_in  = [-sep_total/2] + y_in + [y_in[-1]]
                    
                    x_out = [x_out[0]] + x_out + [-sep_total/2]
                    x_in  = [x_in[0]] + x_in + [-sep_total/2]
                    
                elif i == 2:
                    y_out = [sep_total/2] + y_out + [y_out[-1]]
                    y_in  = [sep_total/2] + y_in + [y_in[-1]]
                    
                    x_out = [x_out[0]] + x_out + [sep_total/2]
                    x_in  = [x_in[0]] + x_in + [sep_total/2]
                    
                elif i == 3:
                    y_out = [y_out[0]] + y_out + [-sep_total/2]
                    y_in  = [y_in[0]] + y_in + [-sep_total/2]
                    
                    x_out = [sep_total/2] + x_out + [x_out[-1]]
                    x_in  = [sep_total/2] + x_in + [x_in[-1]]
                
                polys_top_windings.append( ( x_out + x_in[::-1] , y_out + y_in[::-1]) )
                
            #bottom bridge
            if winding in bottom_bridge_windings :
                    
                h = -R2 * np.sin(np.pi*(1/2 - 1/self.sides))
                    
                x = [ -sep_total/2, sep_total/2,  sep_total/2, -sep_total/2 ]
                y = [ h, h, h - self.width, h - self.width ]
                    
                polys_top_windings.append( (x, y) )
                    
            #top bridge
            if winding in top_bridge_windings :
                    
                h = (R2 + v) * np.sin(np.pi*(1/2 - 1/self.sides))
                    
                x = [ -sep_total/2, sep_total/2,  sep_total/2, -sep_total/2 ]
                y = [ h, h, h - self.width, h - self.width ]
                    
                polys_top_windings.append( (x, y) )
            
            #left right bridges
            if winding in leftright_bridge_windings :
                
                #right bridge
                h = (R2 + v) * np.sin(np.pi*(1/2 - 1/self.sides))
                
                x = [ -sep_total/2, sep_total/2,  sep_total/2, -sep_total/2 ]
                y = [ h, h, h - self.width, h - self.width ]
                
                polys_top_windings.append( (y, x) )
                
                #left bridge
                h = -R2 * np.sin(np.pi*(1/2 - 1/self.sides))
                
                x = [ -sep_total/2, sep_total/2,  sep_total/2, -sep_total/2 ]
                y = [ h, h, h - self.width, h - self.width ]
                
                polys_top_windings.append( (y, x) )
            
            #top crossings
            if winding in top_crossing_windings :
                
                h = R1 * np.sin(np.pi*(1/2 - 1/self.sides)) 
                
                x0 = 0
                y0 = h - self.width - self.spacing/2
                
                x_cross, y_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=extend)
                polys_bottom_crossings.append( (x_cross, y_cross) )
                
                x_cross, y_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=0)
                polys_top_windings.append( ([-x for x in x_cross], y_cross) )
                
                via_centers_t_b.append( ( -sep_total/2-self.width/2 , h - 3*self.width/2 - self.spacing ) )
                via_centers_t_b.append( ( sep_total/2+self.width/2 , h-self.width/2 ) )
                        
            #bottom crossings
            if winding in bottom_crossing_windings :
                        
                h = (-R2 + s) * np.sin(np.pi*(1/2 - 1/self.sides))
                
                x0 = 0
                y0 = h - self.width - self.spacing/2
                
                x_cross, y_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=extend)
                polys_bottom_crossings.append( (x_cross, y_cross) )
                
                x_cross, y_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=0)
                polys_top_windings.append( ([-x for x in x_cross], y_cross) )
                
                via_centers_t_b.append( ( -sep_total/2-self.width/2 , h - 3*self.width/2 - self.spacing ) )
                via_centers_t_b.append( ( sep_total/2+self.width/2 , h-self.width/2 ) )
                
            #left right crossings
            if winding in leftright_crossing_windings :
                
                #right crossings
                h = (R1) * np.sin(np.pi*(1/2 - 1/self.sides)) 
                
                x0 = 0 
                y0 = h - self.width - self.spacing/2
                
                y_cross, x_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=extend)
                polys_bottom_crossings.append( (x_cross, y_cross) )
                
                y_cross, x_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=0)
                polys_top_windings.append( ([-x for x in x_cross], y_cross) )
                
                via_centers_t_b.append( (h - 3*self.width/2 - self.spacing, -sep_total/2-self.width/2 ) )
                via_centers_t_b.append( (  h-self.width/2, sep_total/2+self.width/2 ) )
                
                #left crossings
                h = (-R2 + s) * np.sin(np.pi*(1/2 - 1/self.sides))
                
                x0 = 0 
                y0 = h - self.width - self.spacing/2
                
                y_cross, x_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=extend)
                polys_bottom_crossings.append( (x_cross, y_cross) )
                
                y_cross, x_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=0)
                polys_top_windings.append( ([-x for x in x_cross], y_cross) )
                
                via_centers_t_b.append( ( h - 3*self.width/2 - self.spacing, -sep_total/2-self.width/2 ) )
                via_centers_t_b.append( (  h-self.width/2, sep_total/2+self.width/2 ) )
                
            #update radii
            R1 -= s
            R2 -= s
        
        #center tap primary ----------------------------------------------------------------------

        if self.center_tap_primary:
            
            _extend = min(self.width, extend)

            if self.N1  % 2 == 0:
                #primary ends bottom
                
                x_center_tap = [-self.width/2, -self.width/2, self.width/2, self.width/2]
                y_center_tap = [-self.Dout/2 + self.width - _extend, -self.Dout/2 + (self.spacing + self.width) * N1_end, 
                                -self.Dout/2 + (self.spacing + self.width) * N1_end , -self.Dout/2 + self.width - _extend ]
                
                x_ct_1 = 0
                y_ct_1 = -self.Dout/2 + self.spacing * N1_end + self.width * (N1_end + 1) - self.width + _extend/2
                
                x_ct_2 = 0
                y_ct_2 = -self.Dout/2 + self.width/2 + (self.width-_extend)/2
                
            else:
                #primary ends top
                
                x_center_tap = [self.width/2, self.width/2, -self.width/2, -self.width/2]
                y_center_tap = [self.Dout/2 - self.width + _extend, self.Dout/2 - (self.spacing + self.width) * N1_end, 
                                self.Dout/2 - (self.spacing + self.width) * N1_end , self.Dout/2 - self.width + _extend ]
                
                x_ct_1 = 0
                y_ct_1 = self.Dout/2 - self.spacing * N1_end - self.width * (N1_end + 1) + self.width - _extend/2
                
                x_ct_2 = 0
                y_ct_2 = self.Dout/2 - self.width/2 - (self.width-_extend)/2
                
            #geo
            if N1_end > 1:
                via_centers_t_ct.append( ( x_ct_1, y_ct_1 ) )
                via_centers_t_ct.append( ( x_ct_2, y_ct_2 ) )
                
                x_via_plane_ct_1 = [x_ct_1-self.width/2, x_ct_1-self.width/2, x_ct_1+self.width/2, x_ct_1+self.width/2]
                y_via_plane_ct_1 = [y_ct_1-_extend/2, y_ct_1+_extend/2, y_ct_1+_extend/2, y_ct_1-_extend/2]
                
                x_via_plane_ct_2 = [x_ct_2-self.width/2, x_ct_2-self.width/2, x_ct_2+self.width/2, x_ct_2+self.width/2]
                y_via_plane_ct_2 = [y_ct_2-_extend/2, y_ct_2+_extend/2, y_ct_2+_extend/2, y_ct_2-_extend/2]
            
                polys_top_windings.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                polys_bottom_crossings.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                polys_bottom_crossings.append( ( x_via_plane_ct_2, y_via_plane_ct_2 ) )
            
                if N1_end > 2:
                    polys_center_tap.append( ( x_center_tap, y_center_tap ) )
                    polys_center_tap.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                    polys_center_tap.append( ( x_via_plane_ct_2, y_via_plane_ct_2 ) )
                    
                else:
                    polys_bottom_crossings.append( ( x_center_tap, y_center_tap ) )
            else:
                polys_top_windings.append( ( x_center_tap, y_center_tap ) )
                
        #center tap secondary ----------------------------------------------------------------------

        if self.center_tap_secondary:
            
            _extend = min(self.width, extend)

            if self.N2  % 2 != 0:
                #secondary ends bottom
                
                x_center_tap = [-self.width/2, -self.width/2, self.width/2, self.width/2]
                y_center_tap = [-self.Dout/2 + self.width - _extend, -self.Dout/2 + (self.spacing + self.width) * N2_end, 
                                -self.Dout/2 + (self.spacing + self.width) * N2_end, -self.Dout/2 + self.width - _extend ]
                
                x_ct_1 = 0
                y_ct_1 = -self.Dout/2 + self.spacing * N2_end + self.width * (N2_end + 1) - self.width + _extend/2
                
                x_ct_2 = 0
                y_ct_2 = -self.Dout/2 + self.width/2 + (self.width-_extend)/2
                
            else:
                #secondary ends top
                
                x_center_tap = [self.width/2, self.width/2, -self.width/2, -self.width/2]
                y_center_tap = [self.Dout/2 - self.width + _extend, self.Dout/2 - (self.spacing + self.width) * N2_end, 
                                self.Dout/2 - (self.spacing + self.width) * N2_end , self.Dout/2 - self.width + _extend ]
                
                x_ct_1 = 0
                y_ct_1 = self.Dout/2 - self.spacing * N2_end - self.width * (N2_end + 1) + self.width - _extend/2
                
                x_ct_2 = 0
                y_ct_2 = self.Dout/2 - self.width/2 - (self.width-_extend)/2
                
            #geo
            if N2_end > 1:
                via_centers_t_ct.append( ( x_ct_1, y_ct_1 ) )
                via_centers_t_ct.append( ( x_ct_2, y_ct_2 ) )
                    
                x_via_plane_ct_1 = [x_ct_1-self.width/2, x_ct_1-self.width/2, x_ct_1+self.width/2, x_ct_1+self.width/2]
                y_via_plane_ct_1 = [y_ct_1-_extend/2, y_ct_1+_extend/2, y_ct_1+_extend/2, y_ct_1-_extend/2]
                    
                x_via_plane_ct_2 = [x_ct_2-self.width/2, x_ct_2-self.width/2, x_ct_2+self.width/2, x_ct_2+self.width/2]
                y_via_plane_ct_2 = [y_ct_2-_extend/2, y_ct_2+_extend/2, y_ct_2+_extend/2, y_ct_2-_extend/2]
                
                polys_top_windings.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                polys_bottom_crossings.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                polys_bottom_crossings.append( ( x_via_plane_ct_2, y_via_plane_ct_2 ) )
                
                if N2_end > 2:
                    polys_center_tap.append( ( x_center_tap, y_center_tap ) )
                    polys_center_tap.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                    polys_center_tap.append( ( x_via_plane_ct_2, y_via_plane_ct_2 ) )
                    
                else:
                    polys_bottom_crossings.append( ( x_center_tap, y_center_tap ) )
            else:
                polys_top_windings.append( ( x_center_tap, y_center_tap ) )
            
        #bottom port 
        if (self.center_tap_primary and self.N1 %2==0) or (self.center_tap_secondary and self.N2 %2!=0):
            
            x_port = [-sep_total/2 , -self.spacing - self.width/2, -self.spacing - self.width/2,
                      -self.spacing-3*self.width/2 ,-self.spacing-3*self.width/2, -sep_total/2 ]
            y_port = [-self.Dout/2+self.width, -self.Dout/2+self.width, -self.Dout/2-self.width, 
                      -self.Dout/2-self.width, -self.Dout/2, -self.Dout/2]
            
            x_center_tap_port = [-self.width/2, -self.width/2, self.width/2, self.width/2]
            y_center_tap_port = [-self.Dout/2-self.width, -self.Dout/2+self.width, 
                                 -self.Dout/2+self.width, -self.Dout/2-self.width]
                
            polys_top_windings.append( ( x_center_tap_port, y_center_tap_port ) )
        else:
            x_port = [-sep_total/2 , -self.spacing/2, -self.spacing/2, 
                      -self.spacing/2-self.width, -self.spacing/2-self.width, -sep_total/2]
            y_port = [-self.Dout/2+self.width, -self.Dout/2+self.width, 
                      -self.Dout/2-self.width, -self.Dout/2-self.width, -self.Dout/2, -self.Dout/2]
        
        polys_top_windings.append( ( x_port, y_port ) )
        polys_top_windings.append( ( [-x for x in x_port], y_port ) )
        
        #top port 
        if (self.center_tap_primary and self.N1 %2!=0) or (self.center_tap_secondary and self.N2 %2==0):
            
            x_port = [-sep_total/2 , -self.spacing - self.width/2, -self.spacing - self.width/2, 
                      -self.spacing-3*self.width/2 ,-self.spacing-3*self.width/2, -sep_total/2]
            y_port = [-self.Dout/2+self.width, -self.Dout/2+self.width, -self.Dout/2-self.width, 
                      -self.Dout/2-self.width, -self.Dout/2, -self.Dout/2]
            
            x_center_tap_port = [-self.width/2, -self.width/2, self.width/2, self.width/2]
            y_center_tap_port = [self.Dout/2+self.width, self.Dout/2-self.width, 
                                 self.Dout/2-self.width, self.Dout/2+self.width]
                
            polys_top_windings.append( ( x_center_tap_port, y_center_tap_port ) )
        else:
            x_port = [-sep_total/2, -self.spacing/2, -self.spacing/2, -self.spacing/2-self.width, 
                      -self.spacing/2-self.width, -sep_total/2]
            y_port = [-self.Dout/2+self.width, -self.Dout/2+self.width, -self.Dout/2-self.width, 
                      -self.Dout/2-self.width, -self.Dout/2, -self.Dout/2]
        
        polys_top_windings.append( ( x_port, [-y for y in y_port] ) )
        polys_top_windings.append( ( [-x for x in x_port], [-y for y in y_port] ) )
        
        #vias
        for x, y in via_centers_t_ct:

            _extend = min(self.width, extend)
            
            if N > 3:
                polys_vias_t_ct += via_grid(x, y, self.width-2*self.via_in_metal, _extend-2*self.via_in_metal, 
                                            self.via_spacing, self.via_width, self.via_merge)
            polys_vias_t_b  += via_grid(x, y, self.width-2*self.via_in_metal, _extend-2*self.via_in_metal, 
                                        self.via_spacing, self.via_width, self.via_merge)
        
        for x, y in via_centers_t_b:
            
            dx = np.sign(x) * (extend-self.width)/2
            dy = np.sign(y) * (extend-self.width)/2
            
            if abs(y) > abs(x):
                polys_vias_t_b += via_grid(x+dx, y, extend-2*self.via_in_metal, self.width-2*self.via_in_metal, 
                                           self.via_spacing, self.via_width, self.via_merge)
            else:
                polys_vias_t_b += via_grid(x, y+dy, self.width-2*self.via_in_metal, extend-2*self.via_in_metal, 
                                           self.via_spacing, self.via_width, self.via_merge)

        #assign polygons to layers
        self.layers = {"windings"  : polys_top_windings, 
                       "crossings" : polys_bottom_crossings, 
                       "vias1"     : polys_vias_t_b, 
                       "centertap" : polys_center_tap,
                       "vias2"     : polys_vias_t_ct, 
                       "pgs"       : []}


    def to_gds(self, path, unit=1e-6, add_port_labels=True):

        lib = gdstk.Library(unit=unit)

        cell = lib.new_cell("SymmetricTransformer")

        #add polygons to each layer
        for xx, yy in self.layers["windings"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=1, datatype=0))

        for xx, yy in self.layers["crossings"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=2, datatype=0))

        for xx, yy in self.layers["centertap"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=4, datatype=0))

        for xx, yy in self.layers["vias1"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=3, datatype=0))

        for xx, yy in self.layers["vias2"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=5, datatype=0))

        for xx, yy in self.layers["pgs"]:
            points = list(zip(xx, yy))
            cell.add(gdstk.Polygon(points, layer=10, datatype=0))

        if add_port_labels:

            y_label = -self.Dout/2 - self.width

            if (self.center_tap_primary and self.N1%2==0) or (self.center_tap_secondary and self.N2%2!=0):
                x_1_label = self.spacing + self.width 
            else:
                x_1_label = (self.spacing + self.width)/2

            if (self.center_tap_primary and self.N1%2!=0) or (self.center_tap_secondary and self.N2%2==0):
                x_2_label = self.spacing + self.width 
            else:
                x_2_label = (self.spacing + self.width)/2

            #primary side ports
            n_p = 1
            cell.add(gdstk.Label(f"P{n_p}", (-x_1_label, y_label), "n", layer=1))
            n_p += 1
            cell.add(gdstk.Label(f"P{n_p}", (x_1_label, y_label), "n", layer=1))

            if self.center_tap_primary:
                y_1_label = y_label if self.N1%2==0 else -y_label
                anchor = "n" if self.N1%2==0 else "s"
                n_p += 1
                cell.add(gdstk.Label(f"P{n_p}", (0.0, y_1_label), anchor, layer=1))

            #secondary side ports
            n_p += 1
            cell.add(gdstk.Label(f"P{n_p}", (-x_2_label, -y_label), "s", layer=1))
            n_p += 1
            cell.add(gdstk.Label(f"P{n_p}", (x_2_label, -y_label), "s", layer=1))
            
            if self.center_tap_secondary:
                y_2_label = -y_label if self.N2%2==0 else y_label
                anchor = "s" if self.N1%2==0 else "n"
                n_p += 1
                cell.add(gdstk.Label(f"P{n_p}", (0.0, y_2_label), anchor, layer=1))

        if not path.endswith(".gds"): path += ".gds"
        lib.write_gds(path)


    def plot(self):

        fig, ax = plt.subplots(tight_layout=True, dpi=120, figsize=(4, 4))

        ax.set_aspect(1)

        for xx, yy in self.layers["pgs"]:
            ax.fill(xx, yy, c="tab:blue", ec=None)

        for xx, yy in self.layers["windings"]:
            ax.fill(xx, yy, c="gold", ec=None)

        for xx, yy in self.layers["crossings"]:
            ax.fill(xx, yy, c="tab:red", ec=None)

        for xx, yy in self.layers["centertap"]:
            ax.fill(xx, yy, c="tab:blue", ec=None)

        for xx, yy in self.layers["vias1"] + self.layers["vias2"]:
            ax.fill(xx, yy, c="k", ec=None)

        ax.set_xlabel("x")
        ax.set_ylabel("y")