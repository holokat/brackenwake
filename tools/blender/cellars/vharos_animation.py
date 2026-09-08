"""Authored heavy-motion clips; final impact poses align with server telegraphs."""
import rigkit as rk


def author_actions(arm):
    clips=[]
    def add(name,keys):clips.append(rk.make_action(arm,name,keys))
    add('idle',[(0,{}),(2,{'chest':(-1.3,0,1),'head':(0,0,-2),'upperarm_L':(1,0,0),'upperarm_R':(-1,0,0)}),(4,{})])
    add('gravesurge',[(0,{}),(1.5,{'chest':(-9,0,0),'upperarm_L':(110,0,0),'upperarm_R':(110,0,0),'forearm_L':(30,0,0),'forearm_R':(30,0,0)}),(3.65,{'chest':(-10,0,0),'head':(8,0,0),'upperarm_L':(125,0,0),'upperarm_R':(125,0,0),'forearm_L':(25,0,0),'forearm_R':(25,0,0)}),(4.2,{'chest':(23,0,0),'head':(-12,0,0),'upperarm_L':(5,0,0),'upperarm_R':(5,0,0)}),(5.6,{})])
    add('funeralcross',[(0,{}),(2,{'chest':(0,0,-12),'upperarm_L':(70,25,-25),'upperarm_R':(70,-25,25),'forearm_L':(70,0,0),'forearm_R':(70,0,0)}),(4.3,{'chest':(-3,0,18),'upperarm_L':(90,25,-35),'upperarm_R':(90,-25,35),'forearm_L':(70,0,0),'forearm_R':(70,0,0)}),(4.8,{'chest':(5,0,-10),'upperarm_L':(55,-65,0),'upperarm_R':(55,65,0),'forearm_L':(5,0,0),'forearm_R':(5,0,0)}),(6.1,{})])
    add('hollowstar',[(0,{}),(2,{'head':(-12,0,0),'chest':(-5,0,0),'upperarm_L':(0,-35,0),'upperarm_R':(0,35,0)}),(4.6,{'head':(-20,0,0),'chest':(-9,0,0),'upperarm_L':(10,-75,0),'upperarm_R':(10,75,0)}),(5,{'head':(3,0,0),'chest':(5,0,0),'upperarm_L':(10,-85,0),'upperarm_R':(10,85,0)}),(6.4,{})])
    add('tombfall',[(0,{}),(1.4,{'upperarm_L':(125,0,0),'upperarm_R':(80,0,0),'forearm_L':(25,0,0),'forearm_R':(45,0,0),'head':(-10,0,0)}),(3.4,{'upperarm_L':(145,0,0),'upperarm_R':(135,0,0),'forearm_L':(5,0,0),'forearm_R':(10,0,0),'head':(-15,0,0)}),(4,{'chest':(10,0,0),'upperarm_L':(70,0,0),'upperarm_R':(70,0,0),'hand_L':(20,0,0),'hand_R':(20,0,0)}),(5.4,{})])
    add('hurt',[(0,{}),(.15,{'chest':(-4,0,3),'head':(-7,0,-5)}),(.7,{})])
    add('die',[(0,{}),(1.8,{'chest':(12,0,0),'head':(15,0,0),'upperarm_L':(10,-15,0),'upperarm_R':(10,15,0)}),(4,{'chest':(32,0,0),'head':(20,0,0),'upperarm_L':(20,-20,0),'upperarm_R':(20,20,0),'forearm_L':(30,0,0),'forearm_R':(30,0,0)}),(8,{'chest':(35,0,0),'head':(25,0,0),'upperarm_L':(25,-25,0),'upperarm_R':(25,25,0),'forearm_L':(35,0,0),'forearm_R':(35,0,0)})])
    return clips
