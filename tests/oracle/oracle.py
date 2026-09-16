# Independent oracle for spec examples (not engine code).
v=dict(productCost=100,customs=10,leadCpa=15,cr=60,dr=45,deliv=25,ret=15,pack=5,ful=10,cc=2,sms=.5,plat=8,gwp=2.5,gwf=3,vat=15,mkt=3,tm=10,price=300)
cr,dr=v['cr']/100,v['dr']/100; sr=cr*dr; lpd=1/sr
blend=v['deliv']*dr+v['ret']*(1-dr); unit=v['productCost']+v['customs']; ops=v['pack']+v['ful']
leadp=lpd*(v['cc']+v['sms']); fixed=unit+blend+ops+v['gwf']+leadp
stack=(v['vat']+v['plat']+v['mkt']+v['gwp'])/100; ad=v['leadCpa']*lpd; tm=v['tm']/100; p=v['price']
print('parity suggested',(fixed+ad)/(1-stack-tm),'be',(fixed+ad)/(1-stack))
gp=p*(1-stack)-fixed; net=gp-ad
print('at 300: gp',gp,'net',net,'margin%',net/p*100,'maxCpa0',gp*sr,'beRoas',p/gp)
for m in [20,15,10,5,0,-5,-10,-20]: print(' row',m,(p*(1-stack-m/100)-fixed)*sr)
fnl=unit+blend+ops+v['gwf']
print('requiredCr%',(v['leadCpa']+v['cc']+v['sms'])/((p*(1-stack-tm)-fnl)*dr)*100)
print('price for maxCpa=15 at 0%? n/a; price to reach tm', (fixed+ad)/(1-stack-tm))
# offers
for n,tot in [(2,550),(3,780)]:
    bf=n*unit+blend+ops+v['gwf']+leadp; pr=tot*(1-stack)-bf-ad; print('offer',n,tot,pr,pr/tot*100)
# tracker canonical at golden plTracker
t=dict(spend=1000,leads=100,conf=50,deliv=40,price=300,cost=100,df=25,rf=15,pack=5,ful=10,cc=2,sms=.5,gwf=3,vat=14,plat=8,mkt=10,gwp=2.5,tm=20)
rev=t['deliv']*t['price']; rto=max(0,t['conf']-t['deliv']); st=(t['vat']+t['plat']+t['mkt']+t['gwp'])/100
nonpct=t['deliv']*t['cost']+t['deliv']*t['df']+rto*t['rf']+t['conf']*(t['pack']+t['ful'])+t['leads']*(t['cc']+t['sms'])+t['conf']*t['gwf']
cogs=nonpct+rev*st; contrib=rev-cogs; net=contrib-t['spend']
print('tracker rev',rev,'cogs',cogs,'contrib',contrib,'net',net,'margin',net/rev*100,'maxCpl0',contrib/t['leads'],'maxCplTm',(rev*(1-t['tm']/100)-cogs)/t['leads'],'cpl',t['spend']/t['leads'])
print('reqPrice tm', (nonpct+t['spend'])/(t['deliv']*(1-st-t['tm']/100)),'be price',(nonpct+t['spend'])/(t['deliv']*(1-st)))

# --- compare_prices oracle (2026-09-17) ---
def pctile(xs, p):
    xs = sorted(xs); k = (len(xs)-1)*p; f = int(k); c = min(f+1, len(xs)-1)
    return xs[f] + (xs[c]-xs[f])*(k-f)
be=(fixed+ad)/(1-stack); sug=(fixed+ad)/(1-stack-tm)
comps=[("A",279,1,0),("B",299,1,30),("C",349,1,0),("D",550,2,0),("E",399,1,0)]
per=[(t+s)/n for _,t,n,s in comps]
print('per',per,'min',min(per),'p25',pctile(per,.25),'med',pctile(per,.5),'p75',pctile(per,.75),'max',max(per))
for name,t,n,s in comps:
    total=t+s; bf=n*unit+blend+ops+v['gwf']+leadp; prof=total*(1-stack)-bf-ad
    print(name,'profit',prof,'margin',prof/total*100,'maxCpaBE',(total/n*(1-stack)-fixed)*sr if n==1 else None)
print('be',be,'sug',sug,'cheaperThanSeller',sum(1 for q in per if q<300)/len(per))
inband=[350,360,380,400]; print('inband p25',pctile(inband,.25),'med',pctile(inband,.5))
