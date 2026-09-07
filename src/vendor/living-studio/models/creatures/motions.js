export const baseMotions=[['idle',3],['walk',1.2],['run',.72],['swing',1.3],['hurt',.8],['die',1.7],['cast',2.2]];
export const rigMotions={
 human:[...baseMotions,['thrust',1.3],['block',1.6],['shieldRaise',1.5],['shout',2],['whistle',1.8],['charge',1.1],['wait',3],['wake',2.4],['hover',3],['reach',1.8]],
 skeleton:[...baseMotions,['thrust',1.3],['block',1.6],['shieldRaise',1.5],['shout',2],['whistle',1.8],['charge',1.1],['wait',3],['wake',2.4],['hover',3],['reach',1.8]],
 goblin:[...baseMotions,['throw',1.4]],
 canine:[['idle',3],['walk',1.2],['run',.7],['lope',.7],['bite',1.1],['hurt',.8],['die',1.5],['howl',2.8],['circle',3.5],['flee',.8],['wake',2],['approach',2.6]],
 boar:[['idle',3],['walk',1.2],['run',.65],['charge',1.2],['gore',1.1],['throwCharge',1.5],['hurt',.8],['die',1.6]],
 rat:[['idle',2.4],['walk',.8],['run',.48],['scurry',.48],['bite',.8],['hurt',.6],['die',1.1],['freeze',2]],
 spider:[['idle',3],['walk',1.2],['run',.66],['bite',1],['lunge',1],['cast',1.5],['webSpit',1.5],['hurt',.8],['die',1.6]],
 grub:[['idle',3],['walk',1.4],['run',1.4],['crawl',1.4],['bite',1.2],['lunge',1.2],['hurt',.8],['die',1.5]],
 wisp:[['idle',3],['drift',3],['hover',3],['walk',3],['run',1.4],['takeOff',1.2],['fly',2],['land',1.3],['approach',2],['cast',1.4],['hurt',.7],['die',1.7]],
 bird:[['idle',3],['walk',1],['run',.65],['takeOff',1.4],['fly',1],['land',1.6],['stoop',1.4],['threat',1.8],['swim',2.2],['hurt',.7],['die',1.4]],
 deer:[['idle',4],['walk',1.3],['run',.7],['bolt',.7],['startle',1.2],['hurt',.8],['die',1.7]],
 small:[['idle',3],['walk',1.1],['run',.7],['hop',.9],['climb',1.2],['startle',1.1],['die',1.2]],
};
