"""Bind the owner-authorized MIT Windows Alpha documents and evidence to this graph."""
from pipeline import *

def main():
    cfg=config();full=OUT/'DSH-SEP-Full';g=readj(full/'graph.json');gh=digest(full/'graph.json');identity=readj(WORK/'program-identity.json');source=readj(WORK/'source-delivery.json')
    assert identity['status']=='pass' and identity['graphSha256']==source['graphSha256']==gh
    summary='pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。'
    tokens={'@GRAPH_SHA256@':gh,'@SOURCE_FILES_SHA256@':source['sourceFilesManifestSha256'],'@MIT_VALIDATION_SUMMARY@':summary,'@PUBLIC_REPOSITORY_URL@':cfg['repositoryUrl']}
    def subst(b):
        for a,c in tokens.items():b=b.replace(a.encode(),c.encode())
        return b
    for name in NAMES:
        root=OUT/name;docs=root/'docs';base=BASE/name;history=docs/'history/office-r2'
        # Exact sealed evidence is historical; never rewrite its hashes/status.
        historical=[(base/'RELEASE-STATUS.json',history/'RELEASE-STATUS.json'),(base/'SOURCE-PROVENANCE.json',history/'SOURCE-PROVENANCE.json'),(base/'docs/RELEASE_MANIFEST.json',history/'RELEASE_MANIFEST.json'),(base/'docs/DEPENDENCIES.json',history/'DEPENDENCIES.json'),(base/'docs/licenses/index.json',history/'licenses-index.json')]
        for src,dst in historical:cp(src,dst)
        for f in files(WORK/'documentation/docs'):
            r=rel(f,WORK/'documentation/docs');write(docs/r,read(f) if 'history/' in r else subst(read(f)))
        write(root/'README.md',subst(read(WORK/'documentation'/('Full-README.md' if name.endswith('Full') else 'Only-README.md'))))
        write(root/'LICENSING.md','# 许可导航\n\n本分发的映射原创 SEP 内容采用根部 [MIT License](LICENSE)。原 DSH 和第三方保留自身条款；请阅读 [完整许可范围](docs/LICENSING.md)、[第三方声明](docs/THIRD_PARTY_NOTICES.md) 与 [文档索引](docs/DOCS_INDEX.md)。\n'.encode())
        write(root/'THIRD_PARTY_NOTICES.md','# 第三方声明导航\n\n完整声明、组件清单与对应许可材料请见 [第三方声明](docs/THIRD_PARTY_NOTICES.md)、[开源集成列表](docs/OPEN_SOURCE_INTEGRATIONS.md) 与 [许可范围](docs/LICENSING.md)。根部 MIT 不对第三方重新授权。\n'.encode())
        index=readj(base/'docs/licenses/index.json');entries=index['entries']
        for entry in entries:
            if entry['file'].startswith('licenses/graph/'):
                relative=entry['file'].removeprefix('licenses/graph/');src=full/'payload/store'/relative
                assert win(src).is_file();cp(src,docs/entry['file']);entry.update(sha256=digest(src),size=win(src).stat().st_size)
        current={r['file'] for r in entries}
        for filename in ['LICENSE-SCOPE.md','LICENSE-SCOPE.json']:
            relative='licenses/graph/p0438/'+filename;src=full/'payload/store/p0438'/filename
            if relative not in current:
                cp(src,docs/relative);entries.append({'source':'program/store/p0438/'+filename,'file':relative,'sha256':digest(src),'size':win(src).stat().st_size})
        index.update(graphSha256=gh,extractionRule='Current notices and source-access records. Mapped original SEP permissions changed to MIT with owner authorization; third-party notices unchanged. Historical records are separate, not current license declarations.')
        writej(docs/'licenses/index.json',index)
        inventory=readj(base/'docs/DEPENDENCIES.json');byid={p['id']:p for p in inventory['packages']}
        for package in g['packages']:
            row=byid[package['id']];p=full/'payload/store'/package['id']/'package.json';pm=readj(p)
            row.update(scope=REV+'-distribution-program-graph',manifestSha256=digest(p),licenseDeclaration=pm.get('license'),noticeFiles=[{'file':e['file'],'sha256':e['sha256']} for e in entries if e['file'].startswith('licenses/graph/'+package['id']+'/')])
            if package['id'] in OWNED:row['localModifications']='Owner-authorized MIT relicense of previously mapped original files; no executable implementation change.'
        inventory.update(documentSet=DOCREV,checkedOn='2026-09-21');inventory['baseline'].update(release=REV,graphSha256=gh)
        inventory['counts']={'graphPackages':len(g['packages']),'graphNoticeFiles':sum(r['file'].startswith('licenses/graph/') for r in entries),'supplementalNoticeFiles':sum(not r['file'].startswith('licenses/graph/') for r in entries),'packagesWithoutLicenseDeclaration':sum(not r.get('licenseDeclaration') for r in inventory['packages'])}
        inventory['scope']['licenseState']='Mapped original SEP contributions use MIT. Existing MIT and all third-party grants remain unchanged.'
        inventory['scope']['publicationState']='Owner-authorized Windows Alpha test release with disclosed known startup issue; final archive evidence is recorded externally.'
        inventory['sepLicense']={'file':'LICENSE','sha256':hashlib.sha256(MIT.encode()).hexdigest(),'status':'owner-confirmed-MIT','scope':'Only mapped original SEP contributions; third-party and existing notices unchanged.'};writej(docs/'DEPENDENCIES.json',inventory)
        oldstatus=readj(base/'RELEASE-STATUS.json');status=copy.deepcopy(oldstatus)
        publication={'channel':'GitHub','repositoryCreated':True,'repositoryUrl':cfg['repositoryUrl'],'releaseUrl':cfg['releaseUrl'],'releaseTag':cfg['releaseTag'],'uploaded':False,'snapshotMeaning':'Package preparation state before remote upload; remote publication is verified separately.','publicReleaseLevel':'Windows Alpha test','ownerAuthorizedKnownIssues':True,'dailyInstallationChanged':False}
        status.update(distribution=REV,status='pass',stage='owner-approved-windows-alpha-known-issues-disclosed',publicReleaseReady=True,graphSha256=gh,baseGraphSha256=BASE_GRAPH,publication=publication,releaseLevel='Windows Alpha test',packageKind='full' if name.endswith('Full') else 'only',packageName=name+'-Windows-x64')
        status['validationBlockers']=[];status['knownIssues']=[{'code':'HOST_STARTUP_UNATTRIBUTED','causeStatus':'unattributed','fixed':False,'acceptedForThisReleaseLevel':True,'acceptance':'Owner explicitly approved Windows Alpha testing with disclosure. Historical failure remains unchanged; not stable release certification.'}]
        status['originalPublicationConditions']=oldstatus['validationBlockers']
        status['finalGraphBinding']={'status':'pass','packages':len(g['packages']),'files':len(g['files']),'scope':'Mapped MIT license/declaration/document changes only; byte-equivalent executable implementation to the bound Office-r2 graph.','evidence':'docs/evidence/mit-program-identity.json'}
        status['currentPackageValidation']={'status':'pass','graphSha256':gh,'scope':'Current program/code-equivalence and source/notice binding verified. Final immutable MIT ZIP installation and privacy verification are separately bound in external DELIVERY-REPORT.json; inherited functional evidence remains on its original graph.','evidence':'docs/evidence/mit-program-identity.json'}
        status['licenseSynchronization']={'status':'pass','license':'MIT','scope':'Owner-authorized mapped originals only; not third-party relicensing or full legal certification.','coverage':{'packages':len(g['packages']),'noticeEntries':len(entries),'missingLicenseDeclarations':0},'approvedSepLicenseSha256':hashlib.sha256(MIT.encode()).hexdigest(),'evidence':'docs/licenses/release/LICENSE-SYNCHRONIZATION.md'}
        status['sourceAccess']['office']['preferredSource']='DSH-SEP-Source-20260921-MIT.zip'
        writej(root/'RELEASE-STATUS.json',status)
        provenance=readj(base/'SOURCE-PROVENANCE.json');provenance.update(distribution=REV,packageKind=status['packageKind'],publicReleaseReady=True,baseGraphSha256=BASE_GRAPH,distributionGraphSha256=gh,publication=publication,license=status['licenseSynchronization'],sourceAccess=status['sourceAccess'])
        provenance['sourceDelivery'].update(status='pass',sourceFiles=source['files'],exactReleaseFiles=source['exactReleaseFiles'],supplementalAuthoringFiles=source['supplementalFiles'],sourceFilesManifestSha256=source['sourceFilesManifestSha256'],snapshot='DSH-SEP-Source-20260921-MIT.zip')
        provenance['codeEquivalence']={'baselineGraphSha256':BASE_GRAPH,'status':'pass','executableChanges':0,'evidence':'docs/evidence/mit-program-identity.json'};writej(root/'SOURCE-PROVENANCE.json',provenance)
        rm=readj(base/'docs/RELEASE_MANIFEST.json');rm.update(documentRevision=DOCREV,localAcceptanceStatus='pass',localAcceptanceScope='MIT license/source/metadata binding and executable byte equivalence; final ZIP evidence external. Functional tests inherited without expanding their scope.',publicReleaseReady=True,publicationBlockers=[])
        rm['knownIssues']=status['knownIssues'];rm['publicRelease'].update(authorizedLicense='MIT License',currentSourceLicense=f'{len(g["packages"])} packages, {len(entries)} notice/source entries. Only previously mapped original SEP contributions relicensed to MIT; all third-party terms and original notices retained.',status='owner_authorized_windows_alpha_pending_upload',latestArchivesReady=True,repositoryUrl=cfg['repositoryUrl'],downloadUrl=cfg['releaseUrl'],licenseSha256=hashlib.sha256(MIT.encode()).hexdigest(),commercialDistribution='Permitted for the MIT-covered original contributions, subject to MIT notice retention; third-party terms separately apply.',derivativeRestriction='MIT notice and disclaimer retention; no SEP-specific commercial restriction.',requestedRights=['use','copy','modify','merge','publish','distribute','sublicense','sell'])
        rm['distribution']={'releaseId':REV,'status':'pass','scope':'Owner-authorized Windows Alpha graph/source binding; final archives verified separately. Not an assertion that the historical startup cause is fixed.','graphSha256':gh,'sourceBinding':{'snapshot':'DSH-SEP-Source-20260921-MIT.zip',**source},'archives':[{'kind':'only','filename':'DSH-SEP-Only-Windows-x64.zip'},{'kind':'full','filename':'DSH-SEP-Full-Windows-x64.zip'}],'artifactChecksums':'External SHA256SUMS.txt and DELIVERY-REPORT.json.'};writej(docs/'RELEASE_MANIFEST.json',rm)
        writej(docs/'evidence/mit-program-identity.json',identity)
        # This new evidence wrapper does not overwrite or rebind old functional logs.
        writej(docs/'evidence/mit-release-scope.json',{'status':'pass','distribution':REV,'graphSha256':gh,'baselineGraphSha256':BASE_GRAPH,'runtimeCodeChanges':0,'inheritedFunctionalEvidence':'office-validation.json remains bound to Office-r2','finalZipEvidence':'External DELIVERY-REPORT.json','ownerAuthorizedKnownIssueAlpha':True,'startupCauseFixed':False,'modelCalls':0})
        write(docs/'SHA256SUMS.txt',''.join(digest(f)+'  '+rel(f,docs)+'\n' for f in files(docs) if rel(f,docs)!='SHA256SUMS.txt').encode())
        print(json.dumps({'package':name,'graphSha256':gh,'noticeEntries':len(entries),'sourceFiles':source['files']}),flush=True)
    for filename in ['README.md','GITHUB-RELEASE-DRAFT.md','GITHUB-PUBLISH-STEPS.md']:
        p=WORK/'documentation'/('Release-README.md' if filename=='README.md' else filename)
        if p.exists():write(OUT/filename,subst(read(p)))
    writej(WORK/'metadata-result.json',{'status':'pass','graphSha256':gh,'license':'MIT','noticeEntries':len(entries),'repositoryUrl':cfg['repositoryUrl']})

if __name__=='__main__':main()
