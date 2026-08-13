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
	const clsNode = `${cls.node} ${selected ? cls.selected : ""}`
	const title = node.hit
		? leafTitle(node.path, node.hit.core?.count, node.hit.streams)
		: node.path

	const handleTwist = (e: React.MouseEvent) => {
		e.stopPropagation()
		if (hasChildren) setOpen(!open)
	}
	const handleClick = () => {
		if (node.hit) onSelect?.(node)
		else if (hasChildren) setOpen(!open)
	}

	return (
		<div>
			<div className={clsNode} onClick={handleClick} title={title}>
				<div className={cls.twist} onClick={handleTwist}>
					{hasChildren ? (open ? "▾" : "▸") : ""}
				</div>
				<div className={cls.segment}>{node.segment}</div>
				<div className={cls.meta}>
					{node.hit?.core && <span className={`${cls.chip} ${cls.core}`}>live</span>}
					{node.hit?.streams.map(s => (
						<span key={s.name} className={`${cls.chip} ${cls.js}`}>{s.name}</span>
					))}
					{!node.hit && node.names > 0 && <span className={cls.count}>{node.names}</span>}
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
