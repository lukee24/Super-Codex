from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance, ImageStat
import json, shutil

out=Path('artifacts/visual/composer-comparison')
out.mkdir(parents=True,exist_ok=True)
source=Path.home()/'Pictures'/'Screenshots'
cases=[('approval','屏幕截图 2026-10-28 153617.png',(187,49,486,214),'menu-approval-current.png'),('add-top','屏幕截图 2026-10-28 153622.png',(139,57,875,377),'menu-add-top-current.png'),('add-bottom','屏幕截图 2026-10-28 153627.png',(150,65,886,386),'menu-add-bottom-current.png')]
report={}
for name,filename,box,current in cases:
    shutil.copy2(source/filename,out/f'{name}-original.png')
    reference=Image.open(source/filename).convert('RGB').crop(box)
    actual=Image.open(Path('artifacts/visual')/current).convert('RGB')
    reference.save(out/f'{name}-reference-crop.png');actual.save(out/f'{name}-current.png')
    size=(max(reference.width,actual.width),max(reference.height,actual.height))
    a=Image.new('RGB',size,(24,24,24)); b=a.copy();a.paste(reference,(0,0));b.paste(actual,(0,0))
    Image.blend(a,b,.5).save(out/f'{name}-overlay.png')
    diff=ImageChops.difference(a,b);ImageEnhance.Contrast(diff).enhance(4).save(out/f'{name}-difference.png')
    report[name]={'reference_size':reference.size,'current_size':actual.size,'mean_absolute_rgb_error':round(sum(ImageStat.Stat(diff).mean)/3,2),'note':'Unaligned supplied screenshot crops; differences include font rendering, clipping and demo labels.'}
(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
