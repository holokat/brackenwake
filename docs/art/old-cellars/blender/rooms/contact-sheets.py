"""Contact sheets for review only; original exported-GLB renders remain unchanged."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
here=Path(__file__).resolve().parent
titles=['Broken wine vault','Sunken reliquary','Bellkeeper’s tomb','Funeral furnace','Lich’s archive','Hanging sarcophagi','Grave of the first king','Buried cathedral']
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
for start in (1,5):
    sheet=Image.new('RGB',(1680,1808),(17,22,29));draw=ImageDraw.Draw(sheet)
    for row,level in enumerate(range(start,start+4)):
        for col,view in enumerate(('hero','reverse','overhead')):
            p=here/f'cellar-room-{level:02d}-{view}.png'
            im=Image.open(p).convert('RGB');im.thumbnail((560,420),Image.Resampling.LANCZOS)
            x=col*560;y=row*452
            draw.text((x+12,y+6),f'{level}. {titles[level-1]} / {view}',fill=(219,225,234),font=font)
            sheet.paste(im,(x,y+32))
    sheet.save(here/f'rooms-{start:02d}-{start+3:02d}-review.png')
