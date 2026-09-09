"""Game coordinates, materials and exact architectural contracts for descent rooms."""
ROOMS=[
 {'id':'boss-01','level':1,'theme':'command','name':'Blackhand command vault','rx':31,'rz':22,'ceiling':18},
 {'id':'boss-02','level':2,'theme':'ossuary','name':'Morva drowned reliquary','rx':31,'rz':22,'ceiling':25},
 {'id':'boss-03','level':3,'theme':'bells','name':'Sexton bellkeeper crypt','rx':31,'rz':22,'ceiling':30},
 {'id':'boss-04','level':4,'theme':'furnace','name':'Cinder funeral furnace','rx':31,'rz':22,'ceiling':33},
 {'id':'boss-05','level':5,'theme':'archive','name':'Ilex chained archive','rx':31,'rz':22,'ceiling':39},
 {'id':'boss-06','level':6,'theme':'inverted','name':'Voss inverted mausoleum','rx':31,'rz':22,'ceiling':46},
 {'id':'boss-07','level':7,'theme':'titan','name':'Aster royal necropolis','rx':31,'rz':22,'ceiling':55},
 {'id':'regular-crypt','level':0,'theme':'crypt','name':'Forgotten burial hall','rx':24,'rz':20,'ceiling':20},
 {'id':'regular-store','level':0,'theme':'store','name':'Abandoned crossing','rx':24,'rz':20,'ceiling':20},
 {'id':'regular-chapel','level':0,'theme':'chapel','name':'Chapel of names','rx':24,'rz':20,'ceiling':23},
]
PALETTE={'limestone':(0x777b7c,0,.95,0),'trim':(0xabb1b0,0,.83,0),'floor':(0x707578,0,.87,0),'ceiling':(0x454f59,0,.94,0),'wood':(0x795331,0,.86,0),'timber':(0x48372c,0,.9,0),'iron':(0x343b3d,.75,.43,0),'bronze':(0x987449,.73,.36,0),'glow':(0xffbc68,0,.5,2),'wax':(0xc5b386,0,.87,0),'bottle':(0x394c38,.15,.35,0),'dark':(0x191f25,0,.98,0),'rubble':(0x72767a,0,1,0),'coal':(0x221c18,0,.97,0),'cloth':(0x304650,0,1,0),'bone':(0xb7ac91,0,.88,0),'water':(0x24606b,.45,.27,.12),'rune':(0x789ab6,.2,.5,.3),'pages':(0x998969,0,.91,0),'book':(0x315048,0,.92,0)}
COLORS={'command':0xb99568,'ossuary':0x53b7b5,'bells':0x9aace0,'furnace':0xeb8a4b,'archive':0x76b997,'inverted':0x85abd5,'titan':0xc5a1d2,'crypt':0x93a7ac,'store':0xc4a17b,'chapel':0xb5a4cc}
def room_spec(r):
 rx,rz=r['rx'],r['rz'];ch=5
 return dict(r,x=0,z=0,y=0,polygon=[[-rx+ch,-rz],[rx-ch,-rz],[rx,-rz+ch],[rx,rz-ch],[rx-ch,rz],[-rx+ch,rz],[-rx,rz-ch],[-rx,-rz+ch]],doors=[{'x':0,'z':-rz,'axis':'z','width':12},{'x':0,'z':rz,'axis':'z','width':12},{'x':-rx,'z':0,'axis':'x','width':12},{'x':rx,'z':0,'axis':'x','width':12}])
