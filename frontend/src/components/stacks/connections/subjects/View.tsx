import FrameworkCard from "@/components/cards/FrameworkCard"
import SubjectsIcon from "@/icons/cards/SubjectsIcon"
import layoutSo from "@/stores/layout"
import { SubjectsStore } from "@/stores/stacks/connection/subjects"
import { LOAD_STATE } from "@/stores/stacks/utils"
import { SubjectNode } from "@/types/Subject"
import { emptyCopy, firstListenCopy, LEGEND, statusLines } from "@/utils/subjects/copy"
import { canListen } from "@/utils/subjects/filter"
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
		if (node.remainder) return
		if (node.hit) subjectsSo.openHit(node.hit)
	}
	const handleFilterChange = (value: string) => {
		subjectsSo.setFilter(value)
	}

	const hits = useMemo(() => flattenHits({
		core: subjectsSa.core,
		jetstream: subjectsSa.jetstream,
		occupied: subjectsSa.occupied,
		showCore: subjectsSa.coreEnabled,
		showJetStream: subjectsSa.jetstreamEnabled,
	}), [subjectsSa.core, subjectsSa.jetstream, subjectsSa.occupied, subjectsSa.coreEnabled, subjectsSa.jetstreamEnabled])
	const tree = useMemo(() => filterTree(buildSubjectTree(hits), subjectsSa.textSearch), [hits, subjectsSa.textSearch])
	const status = useMemo(
		() => statusLines(subjectsSa.coreEnabled, subjectsSa.jetstreamEnabled, subjectsSa.core, subjectsSa.jetstream),
		[subjectsSa.coreEnabled, subjectsSa.jetstreamEnabled, subjectsSa.core, subjectsSa.jetstream],
	)
	const empty = useMemo(
		() => emptyCopy({
			coreEnabled: subjectsSa.coreEnabled,
			jsEnabled: subjectsSa.jetstreamEnabled,
			core: subjectsSa.core,
			js: subjectsSa.jetstream,
			search: subjectsSa.textSearch,
			foundCount: hits.length,
		}),
		[subjectsSa.coreEnabled, subjectsSa.jetstreamEnabled, subjectsSa.core, subjectsSa.jetstream, subjectsSa.textSearch, hits],
	)
	const loading = subjectsSa.loadingState == LOAD_STATE.LOADING
	const listening = loading && canListen(subjectsSa.filter) && subjectsSa.coreEnabled
	const firstPaint = loading && !subjectsSa.jetstream && !subjectsSa.core
	const clsCard = layoutSo.state.theme == "redeye" ? clsCardRedeye : clsCardBoring
	const listenReady = canListen(subjectsSa.filter)

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
					value={subjectsSa.filter}
					placeholder="orders.>"
					onChange={handleFilterChange}
					onKeyEnter={() => subjectsSo.listenNow()}
				/>
			</div>
		)}

		{loading && (
			<div className={cls.banner}>
				<CircularLoadingCmp style={{ width: 14, height: 14 }} />
				{listening && listenReady
					? firstListenCopy(subjectsSa.filter.trim(), subjectsSa.listenMs)
					: "Reading stored names…"}
			</div>
		)}

		{firstPaint
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
			{status.map(line => <div key={line}>{line}</div>)}
		</div>
	</FrameworkCard>
}

export default SubjectsView
