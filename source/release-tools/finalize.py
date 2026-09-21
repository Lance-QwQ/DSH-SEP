"""Write external delivery metadata after final ZIP installation/identity/privacy checks."""
from pipeline import *

def main():
    cfg=config();archives=readj(WORK/'final-archives.json');privacy=readj(WORK/'privacy.json');installed=readj(WORK/'final-install-validation.json');identity=readj(WORK/'program-identity.json');source=readj(WORK/'source-delivery.json')
    assert privacy['status']==installed['status']==identity['status']=='pass'
    assert installed['graphSha256']==identity['graphSha256']==source['graphSha256']
    for row in archives:assert row['status']=='pass' and digest(OUT/row['filename'])==row['sha256']
    report={'schema':1,'distribution':REV,'releaseLevel':'Windows Alpha test','status':'pass','scope':'Owner-authorized MIT change for mapped SEP originals, current graph/source/notice binding, byte-equivalent executable implementation, fresh final ZIP installation and privacy scans. No full functional or paid-model rerun.','graphSha256':identity['graphSha256'],'baselineGraphSha256':BASE_GRAPH,'repositoryUrl':cfg['repositoryUrl'],'releaseUrl':cfg['releaseUrl'],'archives':archives,'codeEquivalence':identity,'sourceDelivery':source,'finalInstallValidation':installed,'privacy':privacy,'publication':{'authorized':True,'publicReleaseReady':True,'level':'Windows Alpha test','repositoryCreated':True,'uploadedByThisPackagingTask':False,'dailyInstallationChanged':False},'knownIssues':[{'code':'HOST_STARTUP_UNATTRIBUTED','causeStatus':'unattributed','fixed':False,'ownerAcceptedForAlpha':True,'interpretation':'Earlier successful repeats do not establish a repair; this is disclosed Alpha release authorization, not stable-release certification.'}],'inheritedFunctionalEvidence':{'graphSha256':BASE_GRAPH,'evidence':'Package docs/evidence/office-validation.json retains original identities and failures; executable bytes match.','scope':'Fixed isolated Windows 11 tests only; not every environment or arbitrary document.'},'modelCalls':0}
    writej(OUT/'DELIVERY-REPORT.json',report)
    writej(WORK/'delivery-ready.json',{'status':'pass','graphSha256':identity['graphSha256'],'deliveryReportSha256':digest(OUT/'DELIVERY-REPORT.json'),'archives':archives,'uploaded':False,'dailyChanged':False})
    print('MIT Windows Alpha local delivery verified; upload belongs to repository workflow.',flush=True)

if __name__=='__main__':main()
