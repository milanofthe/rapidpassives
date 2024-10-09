#########################################################################################
##
##                       SYMMETRIC INDUCTOR LAYOUT GENERATION
##
##                                   Milan Rother
##
#########################################################################################

# imports -------------------------------------------------------------------------------

import matplotlib.pyplot as plt
import numpy as np

import gdstk

from .utils.shapes import via_grid, routing_geometric_45


# generation class ----------------------------------------------------------------------

class SymmetricInductor:

    """
    INPUTS:
        Dout         : outer diameter
        N            : number of windings
        sides        : number of sides of polygon (multiples of 2, starting with 4)
        width        : width of conductor
        spacing      : spacing between conductors
        center_tap   : include center tap for inductor?
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
                 center_tap=False, 
                 via_spacing=0.8, 
                 via_width=1,
                 via_in_metal=0.45, 
                 via_merge=False):

        self.Dout = Dout
        self.N = N
        self.sides = sides 
        self.width = width
        self.spacing = spacing 
        self.center_tap = center_tap 
        self.via_spacing = via_spacing
        self.via_width = via_width
        self.via_in_metal = via_in_metal
        self.via_merge = via_merge

        #verify geometry
        self._check()

        #build polygons
        self._build()


    def _check(self):
        """
        check if geometry of interleaved inductor  is valid
        """

        h = self.width + self.spacing + (np.sqrt(2) - 1) * (2*self.spacing + self.width)
        q = 2 * self.width + self.spacing # spacing for ports
        e = 2 * (self.via_width + self.via_in_metal) + self.via_spacing

        topbridge_ok    = (h + 2*e <= (self.Dout/2 - (self.N - 1) * (self.width + self.spacing)) * np.cos(np.pi / self.sides))
        bottombridge_ok = (h <= (self.Dout/2 - (self.N - 1) * self.spacing - self.N * self.width) * np.cos(np.pi / self.sides))
        port_ok         = (q <= self.Dout/2 * np.cos(np.pi / self.sides))

        if not (topbridge_ok and bottombridge_ok and port_ok):
            raise ValueError("Invalid geometry, choose larger 'Dout'!")


    def _build(self):
        """
        build all the polygons
        """

        #width projected to polygon 
        v = self.width / np.cos(np.pi/self.sides)
        
        #winding distance projected to polygon
        s = (self.spacing + self.width) / np.cos(np.pi/self.sides) 
        
        #starting radii
        R1 = self.Dout / 2 / np.cos(np.pi/self.sides) 
        R2 = R1 - v
        
        #angles
        left_angles  = np.pi * (np.linspace(1/(self.sides), 1-1/(self.sides) , self.sides//2) + 0.5)
        right_angles = np.pi * (np.linspace(1/(self.sides), 1-1/(self.sides) , self.sides//2) - 0.5)
        
        #crossing calculations
        extend = 2 * (self.via_width  + self.via_in_metal ) + self.via_spacing 
        sep_total = self.width + self.spacing + (np.sqrt(2) - 1) * (2*self.spacing + self.width)
        
        #via center collection
        via_centers_t_b  = []
        via_centers_t_ct = []
        
        #initialization of polygon lists
        polys_top_windings     = []
        polys_bottom_crossings = []
        polys_center_tap       = []
        polys_vias_t_b         = []
        polys_vias_t_ct        = []
        
        for winding in range(self.N):
            
            #left sections
            x_out = []
            y_out = []
            
            x_in = []
            y_in = []
            
            for phi in left_angles:
                x_out.append( R1 * np.cos(phi) )
                y_out.append( R1 * np.sin(phi) )
                
                x_in.append( R2 * np.cos(phi) )
                y_in.append( R2 * np.sin(phi) )
                
            if winding == self.N - 1:
                #close last
                if self.N % 2 == 0:
                    #top
                    x_out = [-sep_total/2] + x_out + [0]
                    x_in = [-sep_total/2] + x_in + [0]
                else:
                    #bottom
                    x_out = [0] + x_out + [-sep_total/2]
                    x_in = [0] + x_in + [-sep_total/2]
            else:
                x_out = [-sep_total/2] + x_out + [-sep_total/2]
                x_in = [-sep_total/2] + x_in + [-sep_total/2]
                
            y_out = [y_out[0]] + y_out + [y_out[-1]]
            y_in = [y_in[0]] + y_in + [y_in[-1]]
            
            polys_top_windings.append( ( x_out + x_in[::-1] , y_out + y_in[::-1]) )
                
            #right sections
            x_out = []
            y_out = []
            
            x_in = []
            y_in = []
            
            for phi in right_angles:
                x_out.append( R1 * np.cos(phi) )
                y_out.append( R1 * np.sin(phi) )
                
                x_in.append( R2 * np.cos(phi) )
                y_in.append( R2 * np.sin(phi) )
                
            if winding == self.N - 1:
                #close last
                if self.N % 2 == 0:
                    #top
                    x_out = [0] + x_out + [sep_total/2]
                    x_in = [0] + x_in + [sep_total/2]   
                else:
                    #bottom
                    x_out = [sep_total/2] + x_out + [0]
                    x_in = [sep_total/2] + x_in + [0]
            else:
                x_out = [sep_total/2] + x_out + [sep_total/2]
                x_in = [sep_total/2] + x_in + [sep_total/2]
                
            y_out = [y_out[0]] + y_out + [y_out[-1]]
            y_in = [y_in[0]] + y_in + [y_in[-1]]
            
            polys_top_windings.append( ( x_out + x_in[::-1] , y_out + y_in[::-1]) )
            
            #crossings
            if winding != self.N - 1:
            
                if winding % 2 == 0:
                    #top
                    h = R1 * np.sin(np.pi*(1/2 - 1/self.sides)) 
                else:
                    #bottom
                    h = (-R2 + s) * np.sin(np.pi*(1/2 - 1/self.sides))
                    
                x0 = 0 
                y0 = h - self.width - self.spacing/2
                
                # x_cross, y_cross = routing_geometric( width, sep_total/2, (spacing + width)/2, x0, y0, extend=extend)
                x_cross, y_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=extend)
                polys_bottom_crossings.append( (x_cross, y_cross) )
                
                # x_cross, y_cross = routing_geometric( width, sep_total/2, (spacing + width)/2, x0, y0, extend=extend)
                x_cross, y_cross = routing_geometric_45(self.width, self.spacing, x0, y0, extend=0)
                polys_top_windings.append( ([-x for x in x_cross], y_cross) )
                
                via_centers_t_b.append( ( -sep_total/2-self.width/2 , h - 3*self.width/2 - self.spacing ) )
                via_centers_t_b.append( ( sep_total/2+self.width/2 , h-self.width/2 ) )
                
            #update radii
            R1 -= s
            R2 -= s
            
        #center tap
        if self.center_tap:
            if self.N % 2 != 0:
                #top
                x_center_tap = [-self.width/2, -self.width/2, self.width/2, self.width/2]
                
                if self.N in [1,2]:
                    y_center_tap = [-self.Dout/2, self.Dout/2 - self.spacing * (self.N - 1) - self.width * (self.N - 1), 
                                    self.Dout/2 - self.spacing * (self.N - 1) - self.width * (self.N - 1), -self.Dout/2 ]
                    
                else:
                    
                    y_center_tap = [-self.Dout/2 + self.width - extend, self.Dout/2 - self.spacing * (self.N - 1) - self.width * (self.N - 1) - extend, 
                                    self.Dout/2 - self.spacing * (self.N - 1) - self.width * (self.N - 1) - extend, -self.Dout/2 + self.width - extend]
                
                x_ct_1 = 0
                y_ct_1 = self.Dout/2 - self.spacing * (self.N - 1) - self.width * (self.N - 1) - extend/2
                
                x_ct_2 = 0
                y_ct_2 = -self.Dout/2 + self.width/2 + (self.width-extend)/2
                
            else:
                #bottom
                x_center_tap = [-self.width/2, -self.width/2, self.width/2, self.width/2]
                
                if self.N in [1,2]:
                    y_center_tap = [-self.Dout/2, -self.Dout/2 + self.spacing * (self.N - 1) + self.width * (self.N - 1), 
                                    -self.Dout/2 + self.spacing * (self.N - 1) + self.width * (self.N - 1), -self.Dout/2 ]
                    
                else:
                    y_center_tap = [-self.Dout/2 + self.width - extend, -self.Dout/2 + self.spacing * (self.N - 1) + self.width * (self.N - 1), 
                                    -self.Dout/2 + self.spacing * (self.N - 1) + self.width * (self.N - 1), -self.Dout/2 + self.width - extend ]
                
                x_ct_1 = 0
                y_ct_1 = -self.Dout/2 + self.spacing * (self.N - 1) + self.width * self.N - self.width + extend/2
                
                x_ct_2 = 0
                y_ct_2 = -self.Dout/2 + self.width - extend/2
                
            if self.N in [1, 2]:
                polys_top_windings.append( ( x_center_tap, y_center_tap ) )
                
            else:
                polys_center_tap.append( ( x_center_tap, y_center_tap ) )
                via_centers_t_ct.append( ( x_ct_1, y_ct_1 ) )
                via_centers_t_ct.append( ( x_ct_2, y_ct_2 ) )
                
                x_via_plane_ct_1 = [x_ct_1-self.width/2, x_ct_1-self.width/2, x_ct_1+self.width/2, x_ct_1+self.width/2]
                y_via_plane_ct_1 = [y_ct_1-extend/2, y_ct_1+extend/2, y_ct_1+extend/2, y_ct_1-extend/2]
                
                x_via_plane_ct_2 = [x_ct_2-self.width/2, x_ct_2-self.width/2, x_ct_2+self.width/2, x_ct_2+self.width/2]
                y_via_plane_ct_2 = [y_ct_2-extend/2, y_ct_2+extend/2, y_ct_2+extend/2, y_ct_2-extend/2]
                
                polys_top_windings.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                polys_bottom_crossings.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                polys_center_tap.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                
                # polys_top_windings.append( ( x_via_plane_ct_1, y_via_plane_ct_1 ) )
                polys_bottom_crossings.append( ( x_via_plane_ct_2, y_via_plane_ct_2 ) )
                polys_center_tap.append( ( x_via_plane_ct_2, y_via_plane_ct_2 ) )
                
        #ports
        if self.center_tap:
            x_port = [-sep_total/2 , -self.spacing - self.width/2, -self.spacing - self.width/2, 
                      -self.spacing-3*self.width/2 ,-self.spacing-3*self.width/2, -sep_total/2 ]
            y_port = [-self.Dout/2+self.width, -self.Dout/2+self.width, -self.Dout/2-self.width, 
                      -self.Dout/2-self.width, -self.Dout/2, -self.Dout/2]
            
            x_center_tap_port = [-self.width/2, -self.width/2, self.width/2, self.width/2]
            y_center_tap_port = [-self.Dout/2-self.width, -self.Dout/2+self.width, 
                                 -self.Dout/2+self.width, -self.Dout/2-self.width]
                
            polys_top_windings.append( ( x_center_tap_port, y_center_tap_port ) )
        
        else:
            x_port = [-sep_total/2, -self.spacing/2, -self.spacing/2, -self.spacing/2-self.width, 
                      -self.spacing/2-self.width, -sep_total/2 ]
            y_port = [-self.Dout/2+self.width, -self.Dout/2+self.width, -self.Dout/2-self.width, 
                      -self.Dout/2-self.width, -self.Dout/2, -self.Dout/2]
        
        polys_top_windings.append( ( x_port, y_port ) )
        polys_top_windings.append( ( [-x for x in x_port], y_port ) )
        
        #vias
        for x, y in via_centers_t_ct:
            
            polys_vias_t_ct += via_grid(x, y, self.width-2*self.via_in_metal, extend-2*self.via_in_metal,
                                        self.via_spacing, self.via_width, self.via_merge )
            polys_vias_t_b += via_grid(x, y, self.width-2*self.via_in_metal, extend-2*self.via_in_metal, 
                                       self.via_spacing, self.via_width, self.via_merge )
            
        for x, y in via_centers_t_b:
            
            dx = np.sign(x) * (extend-self.width)/2
            polys_vias_t_b += via_grid(x+dx, y, extend-2*self.via_in_metal, self.width-2*self.via_in_metal, 
                                       self.via_spacing, self.via_width, self.via_merge )
            
        #assign polygons to layers
        self.layers = {"windings"  : polys_top_windings, 
                       "crossings" : polys_bottom_crossings, 
                       "vias1"     : polys_vias_t_b, 
                       "centertap" : polys_center_tap,
                       "vias2"     : polys_vias_t_ct}


    def to_gds(self, path, add_port_labels=True, unit=1e-6):

        lib = gdstk.Library(unit=unit)

        cell = lib.new_cell("SymmetricInductor")

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

        if add_port_labels:

            y_label = -self.Dout/2 - self.width
            x_label = self.spacing + self.width if self.center_tap else (self.spacing + self.width)/2

            n_p = 1
            cell.add(gdstk.Label(f"P{n_p}", (-x_label, y_label), "n", layer=1))

            if self.center_tap:
                n_p += 1
                cell.add(gdstk.Label(f"P{n_p}", (0.0, y_label), "n", layer=1))

            n_p += 1
            cell.add(gdstk.Label(f"P{n_p}", (x_label, y_label), "n", layer=1))


        if not path.endswith(".gds"): path += ".gds"
        lib.write_gds(path)


    def plot(self):

        fig, ax = plt.subplots(tight_layout=True, dpi=120, figsize=(6, 6))

        ax.set_aspect(1)

        for xx, yy in self.layers["windings"]:
            ax.fill(xx, yy, c="gold", alpha=0.4, ec=None)

        for xx, yy in self.layers["crossings"]:
            ax.fill(xx, yy, c="tab:red", alpha=0.4, ec=None)

        for xx, yy in self.layers["centertap"]:
            ax.fill(xx, yy, c="tab:blue", alpha=0.4, ec=None)

        for xx, yy in self.layers["vias1"] + self.layers["vias2"]:
            ax.fill(xx, yy, c="k", ec=None)

        ax.set_xlabel("x")
        ax.set_ylabel("y")

