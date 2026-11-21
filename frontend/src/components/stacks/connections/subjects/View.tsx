import FrameworkCard from "@/components/cards/FrameworkCard"
import SubjectsIcon from "@/icons/cards/SubjectsIcon"
import ReloadIcon from "@/icons/ReloadIcon"
import { SubjectsStore } from "@/stores/stacks/connection/subjects"
import { cardCls } from "@/themes"
import { SubjectNode } from "@/types/Subject"
import { emptyCopy, listenHintCopy, statusLines } from "@/utils/subjects/copy"
import { canListen, isCatchAll } from "@/utils/subjects/filter"
import { buildSubjectTree, filterHits, flattenHits } from "@/utils/subjects/tree"
import { Button, FindInputHeader, IconButton, LOAD_STATE, TextInput, TooltipWrapCmp } from "@priolo/jack"
import FilterDialog from "./FilterDialog"
import { useStore } from "@priolo/jon"
import { FunctionComponent, useEffect, useMemo } from "react"
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

	useEffect(() => {
		subjectsSo.fetchIfVoid()
		return () => { subjectsSo.disposeSubjects() }
	}, [])

	const handleSelect = (node: SubjectNode) => {
		if (node.hit) subjectsSo.setSelect(node.hit.subject)
	}
	const handleFilterChange = (value: string) => {
		subjectsSo.setListenHint(null)
		subjectsSo.setFilter(value)
	}
	const handleAll = () => {
		subjectsSo.setListenHint(null)
		subjectsSo.setFilter(">")
	}

	const hits = useMemo(() => flattenHits({
		core: subjectsSa.core,
		jetstream: subjectsSa.jetstream,
		occupied: subjectsSa.occupied,
		showCore: subjectsSa.coreEnabled,
		showJetStream: subjectsSa.jetstreamEnabled,
		filter: subjectsSa.filter,
		noSysMessages: subjectsSa.noSysMessages,
	}), [subjectsSa.core, subjectsSa.jetstream, subjectsSa.occupied, subjectsSa.coreEnabled, subjectsSa.jetstreamEnabled, subjectsSa.filter, subjectsSa.noSysMessages])
	const visibleHits = useMemo(() => filterHits(hits, subjectsSa.textSearch), [hits, subjectsSa.textSearch])
	const tree = useMemo(() => buildSubjectTree(visibleHits), [visibleHits])
	const selected = visibleHits.find(hit => hit.subject === subjectsSa.select)
	const canOpenLive = selected && canListen(selected.subject)
	const historyStreams = canOpenLive && !/[*>,]/.test(selected.subject)
		? [...new Set(selected.streams
			.filter(stream => stream.kind === "stream" && (stream.count > 0 || !stream.expandable))
			.map(stream => stream.name))]
		: []
	const status = useMemo(
		() => statusLines(subjectsSa.coreEnabled, subjectsSa.jetstreamEnabled, subjectsSa.core, subjectsSa.jetstream, subjectsSa.occupied, subjectsSa.filter),
		[subjectsSa.coreEnabled, subjectsSa.jetstreamEnabled, subjectsSa.core, subjectsSa.jetstream, subjectsSa.occupied, subjectsSa.filter],
	)
	const empty = emptyCopy({
		coreEnabled: subjectsSa.coreEnabled,
		jsEnabled: subjectsSa.jetstreamEnabled,
		core: subjectsSa.core,
		js: subjectsSa.jetstream,
		search: subjectsSa.textSearch,
		foundCount: tree.length,
	})
	const jsLoading = subjectsSa.loadingState == LOAD_STATE.LOADING
	const sampling = subjectsSa.coreSampling
	const firstPaint = jsLoading && !subjectsSa.jetstream && !subjectsSa.core
	const hint = listenHintCopy(subjectsSa.listenHint)

	return <FrameworkCard
		className={cardCls("messages")}
		icon={<SubjectsIcon />}
		store={subjectsSo}
		actionsRender={<>
			<TooltipWrapCmp content="REFRESH">
				<IconButton effect onClick={() => subjectsSo.fetch()}>
					<ReloadIcon />
				</IconButton>
			</TooltipWrapCmp>
			<FindInputHeader
				value={subjectsSa.textSearch}
				onChange={text => subjectsSo.setTextSearch(text)}
			/>
			<Button
				select={subjectsSa.filtersOpen}
				children="FILTERS"
				onClick={() => subjectsSo.setFiltersOpen(!subjectsSa.filtersOpen)}
			/>
		</>}
	>
		<div className={cls.body}>
			<div className={cls.filter}>
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
			</div>
			{subjectsSa.coreEnabled && (
				<div className={cls.filter}>
					<div className="jack-lbl-prop">SAMPLE SUBJECTS</div>
					<Button
						select={isCatchAll(subjectsSa.filter)}
						children="ALL"
						onClick={handleAll}
					/>
					<TextInput
						style={{ flex: 1 }}
						value={subjectsSa.filter}
						placeholder="ex. orders.>"
						onChange={handleFilterChange}
						onKeyEnter={() => subjectsSo.sampleNow()}
					/>
					<Button
						disabled={sampling}
						children={sampling ? "SAMPLING…" : "SAMPLE"}
						onClick={() => subjectsSo.sampleNow()}
					/>
				</div>
			)}

			{hint && <div className={cls.hint}>{hint}</div>}

			{firstPaint
				? null
				: <div className={cls.tree}>
					<SubjectTree
						nodes={tree}
						select={subjectsSa.select}
						onSelect={handleSelect}
						onExpand={source => subjectsSo.loadOccupied(source)}
						empty={empty}
						occupied={subjectsSa.occupied}
						occupiedLoading={subjectsSa.occupiedLoading}
					/>
				</div>
			}

			{canOpenLive && (
				<div className={cls.actions}>
					<code>{selected.subject}</code>
					<div className={cls.filter}>
						<Button onClick={() => subjectsSo.openLive(selected.subject)}>OPEN LIVE MESSAGES</Button>
						{historyStreams.map(streamName => <Button
							key={streamName}
							disabled={subjectsSa.historyPending}
							onClick={() => subjectsSo.openHistory({ subject: selected.subject, streamName })}
						>VIEW HISTORY · {streamName}</Button>)}
					</div>
				</div>
			)}

			{status.length > 0 && (
				<div className={cls.status}>
					{status.map(line => <div key={line}>{line}</div>)}
				</div>
			)}
		</div>

		<FilterDialog store={subjectsSo} />
	</FrameworkCard>
}

export default SubjectsView
