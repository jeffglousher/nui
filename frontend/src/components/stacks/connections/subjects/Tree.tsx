import { SubjectNode } from "@/types/Subject"
import { leafTitle } from "@/utils/subjects/copy"
import { FunctionComponent, memo, useState } from "react"
import cls from "./Tree.module.css"

interface Props {
	nodes: SubjectNode[]
	select?: string
	onSelect?: (node: SubjectNode) => void
	empty?: string
}

const SubjectTree: FunctionComponent<Props> = ({ nodes, select, onSelect, empty }) => {
	if (!nodes || nodes.length == 0) {
		return <div className={`jack-lbl-empty color-fg ${cls.empty}`}>{empty ?? "No names to show."}</div>
	}
	return <div className={cls.root}>
		{nodes.map(node => (
			<TreeNode key={node.path} node={node} select={select} onSelect={onSelect} depth={0} />
		))}
	</div>
}

export default SubjectTree

interface NodeProps {
	node: SubjectNode
	select?: string
	onSelect?: (node: SubjectNode) => void
	depth: number
}

const TreeNode: FunctionComponent<NodeProps> = memo(({ node, select, onSelect, depth }) => {
	const hasChildren = node.children.length > 0
	const [open, setOpen] = useState(depth < 2)
	const selected = !!node.hit && node.path == select
	const clsNode = `${cls.node} ${selected ? cls.selected : ""} ${node.remainder ? cls.remainder : ""}`
	const title = node.remainder
		? node.segment
		: node.hit
			? leafTitle(node.path, node.hit.core?.count, node.hit.streams)
			: node.path

	const handleTwist = (e: React.MouseEvent) => {
		e.stopPropagation()
		if (hasChildren) setOpen(!open)
	}
	const handleClick = () => {
		if (node.remainder) return
		if (node.hit) onSelect?.(node)
		else if (hasChildren) setOpen(!open)
	}

	const kindChip = node.hit?.kind == "kv" ? "kv"
		: node.hit?.kind == "object" ? "object"
			: node.hit?.kind == "pattern" ? "pattern"
				: null

	return (
		<div>
			<div className={clsNode} onClick={handleClick} title={title}>
				<div className={cls.twist} onClick={handleTwist}>
					{hasChildren ? (open ? "▾" : "▸") : node.hit?.expandable ? "▸" : ""}
				</div>
				<div className={cls.segment}>{node.segment}</div>
				<div className={cls.meta}>
					{node.hit?.core && <span className={`${cls.chip} ${cls.core}`}>live</span>}
					{kindChip && <span className={`${cls.chip} ${cls.js}`}>{kindChip}</span>}
					{node.hit?.streams.filter(s => s.kind != "kv" && s.kind != "object").map(s => (
						<span key={s.name} className={`${cls.chip} ${cls.js}`}>{s.name}</span>
					))}
					{!node.hit && !node.remainder && node.names > 0 && <span className={cls.count}>{node.names}</span>}
					{node.remainder && <span className={cls.count}>{node.names}</span>}
				</div>
			</div>
			{hasChildren && open && (
				<div className={cls.children}>
					{node.children.map(child => (
						<TreeNode key={child.path} node={child} select={select} onSelect={onSelect} depth={depth + 1} />
					))}
				</div>
			)}
		</div>
	)
})
