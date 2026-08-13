import FrameworkCard from "@/components/cards/FrameworkCard"
import SubjectsIcon from "@/icons/cards/SubjectsIcon"
import layoutSo from "@/stores/layout"
import { SubjectsStore } from "@/stores/stacks/connection/subjects"
import { LOAD_STATE } from "@/stores/stacks/utils"
import { SubjectNode } from "@/types/Subject"
import { emptyCopy, firstListenCopy, LEGEND, statusLines } from "@/utils/subjects/copy"
import { buildSubjectTree, filterTree, flattenHits } from "@/utils/subjects/tree"
import { Button, CircularLoadingCmp, FindInputHeader, OptionsCmp, TextInput } from "@priolo/jack"
import { useStore } from "@priolo/jon"
import { FunctionComponent, useEffect, useMemo, useState } from "react"
import clsCardBoring from "../../CardBoringDef.module.css"
import clsCardRedeye from "../../CardCyanDef.module.css"
import SubjectTree from "./Tree"
import cls from "./View.module.css"

interface Props {
	store?: SubjectsStore
}

const SubjectsView: FunctionComponent<Props> = ({
	store: subjectsSo,
}) => {

	const subjectsSa = useStore(subjectsSo)
	useStore(subjectsSo.state.group)
	useStore(layoutSo)

	const [textFind, setTextFind] = useState(subjectsSa.textSearch ?? "")

	useEffect(() => {
		subjectsSo.fetchIfVoid()
	}, [])

	const handleSearchChange = (value: string) => {
		setTextFind(value)
		subjectsSo.setTextSearch(value)
	}
	const handleSelect = (node: SubjectNode) => {
		if (node.hit) subjectsSo.openHit(node.hit)
	}
	const handleFilterChange = (value: string) => {
		subjectsSo.setFilter(value.trim() == "" ? ">" : value)
	}

	const hits = useMemo(() => flattenHits(subjectsSa.snapshot), [subjectsSa.snapshot])
	const tree = useMemo(() => filterTree(buildSubjectTree(hits), subjectsSa.textSearch), [hits, subjectsSa.textSearch])
	const status = useMemo(
		() => statusLines(subjectsSa.snapshot?.core, subjectsSa.snapshot?.jetstream),
		[subjectsSa.snapshot],
	)
	const empty = useMemo(
		() => emptyCopy(subjectsSa.snapshot, subjectsSa.textSearch),
		[subjectsSa.snapshot, subjectsSa.textSearch],
	)
	const loading = subjectsSa.loadingState == LOAD_STATE.LOADING
	const firstListen = loading && !subjectsSa.snapshot
	const clsCard = layoutSo.state.theme == "redeye" ? clsCardRedeye : clsCardBoring
	const filterValue = subjectsSa.filter == ">" ? "" : subjectsSa.filter

	return <FrameworkCard
		className={clsCard.root}
		icon={<SubjectsIcon />}
		store={subjectsSo}
		actionsRender={<>
			<OptionsCmp
				style={{ marginLeft: 5, backgroundColor: "rgba(255,255,255,.4)" }}
				store={subjectsSo}
			/>
			<FindInputHeader
				value={textFind}
				onChange={handleSearchChange}
			/>
			<Button
				select={subjectsSa.coreEnabled}
				children="CORE"
				onClick={() => subjectsSo.toggleCore()}
			/>
			<Button
				select={subjectsSa.jetstreamEnabled}
				children="JETSTREAM"
				onClick={() => subjectsSo.toggleJetStream()}
			/>
		</>}
	>
		<div className={cls.legend}>
			{LEGEND.map(line => <div key={line}>{line}</div>)}
		</div>

		{subjectsSa.coreEnabled && (
			<div className={cls.filter}>
				<div className="jack-lbl-prop">LISTEN FOR</div>
				<TextInput
					style={{ flex: 1 }}
					value={filterValue}
					placeholder="all names"
					onChange={handleFilterChange}
					onKeyEnter={() => subjectsSo.fetch()}
				/>
			</div>
		)}

		{loading && (
			<div className={cls.banner}>
				<CircularLoadingCmp style={{ width: 14, height: 14 }} />
				{firstListen
					? firstListenCopy(subjectsSa.listenMs)
					: "Refreshing…"}
			</div>
		)}

		{firstListen
			? null
			: <div className={loading ? cls.busy : undefined}>
				<SubjectTree
					nodes={tree}
					select={subjectsSa.select}
					onSelect={handleSelect}
					empty={empty}
				/>
			</div>
		}

		<div className={cls.status}>
			{subjectsSa.snapshot && status.map(line => <div key={line}>{line}</div>)}
		</div>
	</FrameworkCard>
}

export default SubjectsView
