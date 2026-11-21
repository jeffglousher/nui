import { OccupiedCatalog, SubjectNode, SubjectSource } from "@/types/Subject"
import { rowChip } from "@/utils/subjects/chip"
import { leafTitle } from "@/utils/subjects/copy"
import { occupiedKey } from "@/utils/subjects/tree"
import { Button, CopyButton } from "@priolo/jack"
import { FunctionComponent, useState } from "react"
import cls from "./Tree.module.css"

interface Props {
	nodes: SubjectNode[]
	select?: string
	onSelect?: (node: SubjectNode) => void
	onExpand?: (source: SubjectSource) => void
	empty?: string
	occupied?: Record<string, OccupiedCatalog>
	occupiedLoading?: Record<string, symbol>
}

const SubjectTree: FunctionComponent<Props> = ({
	nodes, empty, ...treeProps
}) => {
	const [openPaths, setOpenPaths] = useState<Record<string, boolean>>({})
	if (!nodes || nodes.length == 0) {
		return <div className={`jack-lbl-empty color-fg ${cls.empty}`}>{empty ?? "No subjects to show."}</div>
	}
	const setOpen = (path: string, open: boolean) => {
		setOpenPaths(prev => (prev[path] == open ? prev : { ...prev, [path]: open }))
	}
	return <div className={cls.root}>
		{nodes.map(node => (
			<TreeNode
				key={`${node.remainder ? "more" : "subject"}:${node.path}`}
				node={node}
				{...treeProps}
				openPaths={openPaths}
				setOpen={setOpen}
			/>
		))}
	</div>
}

export default SubjectTree

interface NodeProps extends Omit<Props, "nodes" | "empty"> {
	node: SubjectNode
	openPaths: Record<string, boolean>
	setOpen: (path: string, open: boolean) => void
}

const TreeNode: FunctionComponent<NodeProps> = ({
	node, ...treeProps
}) => {
	const { select, onSelect, onExpand, occupied, occupiedLoading, openPaths, setOpen } = treeProps
	const hasChildren = node.children.length > 0
	const open = openPaths[node.path] === true
	const selected = !!node.hit && node.path == select
	const sources = node.hit?.streams.filter(source => source.expandable) ?? []
	const singleSource = sources.length == 1 ? sources[0] : undefined
	const key = singleSource && occupiedKey(singleSource.name, singleSource.pattern)
	const occ = key ? occupied?.[key] : undefined
	const loadingOcc = !!key && !!occupiedLoading?.[key]
	const loadedEmpty = !!occ && !occ.error && occ.subjects.length == 0 && !hasChildren
	const canOpen = hasChildren || (sources.length > 0 && !loadedEmpty)
	const clsNode = `${cls.node} ${selected ? cls.selected : ""} ${node.remainder ? cls.remainder : ""}`
	const title = node.remainder
		? node.segment
		: node.hit
			? leafTitle(node.path, node.hit.core?.count, node.hit.streams)
			: node.path
	const chip = rowChip(node.hit, node.segment)
	const copyValue = node.hit?.subject

	const expand = () => {
		if (!canOpen) return
		setOpen(node.path, !open)
		if (!open && singleSource && (!occ || occ.error) && !loadingOcc) onExpand?.(singleSource)
	}
	const activate = () => {
		if (node.remainder) return
		if (node.hit) onSelect?.(node)
		else if (canOpen) expand()
	}

	return (
		<div>
			<div className={`${clsNode} jack-hover-container`} onClick={node.remainder ? undefined : e => { if (!e.defaultPrevented) activate() }} title={title}
				role={node.remainder ? undefined : "button"} tabIndex={node.remainder ? undefined : 0} aria-expanded={canOpen ? open : undefined}
				onKeyDown={node.remainder ? undefined : e => { if (e.key == "Enter" || e.key == " ") { e.preventDefault(); activate() } }}>
				<div className={cls.twist} role={canOpen ? "button" : undefined} tabIndex={canOpen ? 0 : undefined}
					aria-label={canOpen ? `${open ? "Collapse" : "Expand"} ${node.path}` : undefined}
					onClick={e => { e.preventDefault(); expand() }}
					onKeyDown={e => { if (e.key == "Enter" || e.key == " ") { e.stopPropagation(); e.preventDefault(); expand() } }}>
					{canOpen ? (open ? "▾" : "▸") : ""}
				</div>
				<div className={cls.segment}>{node.segment}</div>
				<div className={cls.meta}>
					{copyValue && <span onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key == "Enter" || e.key == " ") e.stopPropagation() }}><CopyButton absolute value={copyValue} label="COPY SUBJECT" /></span>}
					{chip && <span className={`${cls.chip} ${chip.kind == "live" ? cls.core : cls.js}`} title={chip.title}>{chip.label}</span>}
					{loadingOcc && <span className={cls.count}>loading</span>}
					{loadedEmpty && <span className={cls.count}>none stored</span>}
					{occ?.error && <span className={cls.count} title={occ.error}>cannot list</span>}
					{canOpen && !open && node.names > 1 && <span className={cls.count}>{node.names}</span>}
					{node.remainder && <span className={cls.count}>{node.names}</span>}
				</div>
			</div>
			{open && (hasChildren || sources.length > 1) && (
				<div className={cls.children}>
					{sources.length > 1 && sources.map(source => {
						const key = occupiedKey(source.name, source.pattern)
						const result = occupied?.[key]
						const loading = !!occupiedLoading?.[key]
						return <div className={cls.source} key={key}>
							{result && !result.error
								? <span>{source.name}</span>
								: <Button disabled={loading} onClick={() => onExpand?.(source)}>
									{result?.error ? "Retry" : "Browse stored subjects"} · {source.name}
								</Button>}
							<span className={cls.count} role="status" title={result?.error}>
								{loading ? "loading" : result?.error ? "cannot list" : result ? (result.subjects.length ? "loaded" : "none stored") : null}
							</span>
						</div>
					})}
					{node.children.map(child => (
						<TreeNode
							key={`${child.remainder ? "more" : "subject"}:${child.path}`}
							node={child}
							{...treeProps}
						/>
					))}
				</div>
			)}
		</div>
	)
}
