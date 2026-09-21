"""Produce a graph-bound editable source snapshot without relabeling third-party code."""
from pipeline import *

def main():
    source=OUT/'DSH-SEP-Source';assert not (OUT/'DSH-SEP-Source-20260921-MIT.zip').exists()
    if source.exists():
        target=WORK/('source-predecessor-'+datetime.datetime.now().strftime('%H%M%S%f'))
        assert source.resolve().parent==OUT.resolve() and target.resolve().parent==WORK.resolve()
        source.rename(target)
    source.mkdir();oldroot=BASE/'DSH-SEP-Source';old=readj(oldroot/'SOURCE_FILES.json')
    full=OUT/'DSH-SEP-Full';g=readj(full/'graph.json');gh=digest(full/'graph.json');graph={r['path']:r for r in g['files']};rows=[]
    def add(path,data,role,graphpath=None,module=None,extra=None):
        check_path(path);assert not any(r['path']==path for r in rows)
        row={'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'role':role}
        if graphpath:
            assert graph[graphpath]['sha256']==row['sha256'] and graph[graphpath]['size']==len(data)
            row.update(graphPath=graphpath,graphMatch=True)
        if module:row['moduleId']=module
        if extra:row.update(extra)
        write(source/path,data);rows.append(row)
    for row in old['files']:
        original=read(oldroot/row['path']);assert hashlib.sha256(original).hexdigest()==row['sha256']
        path=row['path'];role=row['role'];gp=row.get('graphPath') if role=='exact-release-file' else None
        if gp:data=read(full/'payload'/gp)
        else:data=original
        if path.startswith('packaging/') and path.endswith('.py'):
            path='history/office-r2-build-reference/'+path.removeprefix('packaging/')+'.txt';role='historical-build-reference'
        add(path,data,role,gp,row.get('moduleId'),{'historicalOriginalPath':row['path']} if role=='historical-build-reference' else None)
    existing={r.get('graphPath') for r in rows}
    for gp,row in graph.items():
        if gp.startswith('store/p0438/') and gp not in existing:
            add('program-source/'+gp,read(full/'payload'/gp),'exact-release-file',gp,'p0438')
    for filename in ['pipeline.py','source_build.py','metadata.py','archive_verify.py','finalize.py']:
        add('release-tools/'+filename,read(WORK/filename),'supplemental-MIT-release-source')
    # The old generators are exact historical text, deliberately not runnable entry points.
    write(source/'history/office-r2-build-reference/README.md',b'# Historical Office-r2 build records\n\nThese byte-preserved .py.txt files describe the old restricted-license distribution. They are not MIT release entry points and must not be renamed/executed to regenerate current licensing. Current MIT release tooling is under release-tools/.\n')
    cp(full/'graph.json',source/'graph.json');cp(full/'host-adaptations.json',source/'host-adaptations.json');write(source/'LICENSE',MIT.encode())
    exact=sum(r['role']=='exact-release-file' for r in rows);summary={'graphSha256':gh,'files':len(rows),'exactReleaseFiles':exact,'supplementalFiles':len(rows)-exact,'bytes':sum(r['bytes'] for r in rows)}
    writej(source/'SOURCE_FILES.json',{'schema':1,'distribution':REV,'files':rows,'summary':summary});sh=digest(source/'SOURCE_FILES.json')
    provenance=readj(oldroot/'SOURCE-PROVENANCE.json');provenance.update(distribution=REV,graphSha256=gh,sourceFilesManifestSha256=sh,repository=config()['repositoryUrl'],licenseScope='MIT for mapped original SEP contributions and current authored release tooling. Existing MIT/third-party notices remain unchanged. Historical old build generators are preserved as non-executable .py.txt references.')
    provenance['historicalSourceSnapshotSha256']=PINS['DSH-SEP-Source-20260921-office-r2.zip'];writej(source/'SOURCE-PROVENANCE.json',provenance)
    write(source/'README.md',f'''# DSH SEP MIT Windows Alpha：可审阅发布源码

修订 `{REV}`；公开仓库：{config()['repositoryUrl']}。程序图 `{gh}`，逐文件清单 `SOURCE_FILES.json`。

本快照提供发布图对应的 SEP／适配宿主可编辑文件、Office 适配器 JavaScript／PowerShell／C#、相关测试及补充编写源。当前原创授权为 MIT，原 DSH 和第三方继续适用其原许可。它不是全部传递原生依赖源码或整套软件独立可重复构建证明。

Office 入口为 `program-source/store/p0438/index.js`，测试在本源码快照的同目录 `test/`，不在 Full 的运行载荷中。测试需在独立副本中配合匹配 Full 的依赖／引擎，真实引擎参数 `SEP_OFFICE_EXE` 及范围见 `BUILD.md`；未验证干净克隆的一键测试命令。官方 LibreOffice 匹配源码访问见 `program-source/store/p0439/SOURCE-ACCESS.md`；四份大型上游源码归档没有塞入此 ZIP。

本轮只调整许可、文档与绑定，运行实现与已验证的 Office-r2 图逐字节相同。历史启动异常仍未归因，项目所有者明确批准在披露此已知问题的前提下进行 Windows Alpha 测试发布；这不是稳定版认证。

`release-tools/` 记录从固定旧分发到 MIT 分发的生成过程，采用原发布工作区的固定相对布局，依赖基线归档、外部文档覆盖层与验证材料；没有接收任意基线路径的 CLI 参数。它们可供审阅，不是从本快照直接运行即可封包的独立构建工具。旧 `packaging/*.py` 已移至 `history/office-r2-build-reference/*.py.txt`，只作原字节历史参考，不能作为当前 MIT 生成入口。更多使用边界见 `BUILD.md`。
'''.encode())
    write(source/'BUILD.md','''# 审阅与局部验证

1. 使用本快照 `graph.json` 与同图 Full 包核对身份。`SOURCE_FILES.json` 的 `exact-release-file` 必须逐项匹配图中相应 store 路径。
2. Office adapter 为可编辑 JavaScript；C# Job Object 桥的编写源也随包提供，由 Windows PowerShell 在运行时加载。不要从缺源码的旧 Kit 复制实现。
3. 测试文件来自本源码快照 `program-source/store/p0438/test/*.test.mjs`；Full 的运行载荷没有这些测试。应先建立独立测试副本，保留 `test/` 与 adapter 文件的相对位置，再接入同图 Full 的匹配 Node 依赖与官方引擎。真实引擎测试读取 `SEP_OFFICE_EXE`，指向该独立环境的 `program/soffice.com`。不得直接修改受管 Full 安装树来补测试。具体测试参数见模块 README；本次没有验证从干净 Git 克隆开始的一键安装／测试命令，以上不是该能力承诺。
4. 核对 adapter README、官方 runtime `SOURCE-ACCESS.md` 与 `source-provenance`。上游 Windows 配置和精确外部依赖下载列表随包提供；未在本地重新编译官方 LibreOffice，也未证明整套 DSH 可重复构建。
5. 修改应进入新的隔离候选并重新封图，不能覆盖日常实例。`release-tools/` 是可审阅的发布转换记录：`pipeline.py` 从脚本位置的 `parents[2]` 推导原工作区，其他输入／输出为固定相对路径。它还依赖未全部放入本源码 ZIP 的已封存基线、文档覆盖层和验证材料，没有任意基线路径 CLI 参数；直接在 `release-tools/` 中运行不构成已验证的独立封包流程。旧 Office-r2 生成器以 `history/office-r2-build-reference/*.py.txt` 原字节保留，只作历史参考，不是当前 MIT 生成入口。不存在一条命令重建全部 DSH 及第三方二进制的承诺。

本快照不含真实 Key、私人会话、记忆库或原 Git 历史。MIT 仅适用于已映射原创部分，原 DSH 与第三方许可不变。完整第三方来源和许可义务见对应组件材料。
'''.encode())
    write(source/'SHA256SUMS.txt',''.join(digest(f)+'  '+rel(f,source)+'\n' for f in files(source) if rel(f,source)!='SHA256SUMS.txt').encode())
    writej(WORK/'source-delivery.json',{'status':'pass',**summary,'sourceFilesManifestSha256':sh,'oldGeneratorsHistoricalOnly':True});print(json.dumps(summary),flush=True)

if __name__=='__main__':main()
