const nowMs = () => Number(new Date())
// const logEnabled = false
// const log = (...args) => (logEnabled ? console.log(...args) : null)
const reduceToLast = (...marks) => marks[marks.length - 1]

// createAbstractMark will try to writeAndCreateMark after Xms has ellapsed
// an abstractmark can be debounced by other mark
// and when it happens the abstractMark store the mark causing the debounce
// and redelay its concretisation
// once conretization happens, only if there is a listener
// all marks are reduced to a single mark
// then the reducedMark is passed to writeAndCreateMark and to listener
const createAbstractMark = (mark, ms, writeAndCreateMark) => {
	const marks = [mark]
	let timeout = null
	let listener = null
	let reducer = null
	let concretized = false

	const concretize = () => {
		if (listener) {
			listener(writeAndCreateMark(reducer(...marks)))
		}
		concretized = true
	}
	const start = ms => {
		if (timeout) {
			throw new Error("cannot start an already started abstract mark")
		}
		timeout = setTimeout(concretize, ms)
	}
	const has = () => Boolean(listener)
	const cancel = () => {
		if (timeout) {
			clearTimeout(timeout)
			timeout = null
		}
	}
	const set = (fn, secondFn = reduceToLast) => {
		if (concretized) {
			throw new Error("cannot listen for an already concretized mark")
		}
		if (has()) {
			throw new Error("cannot listen an already listened mark")
		}

		listener = fn
		reducer = secondFn

		return () => {
			listener = null
			reducer = null
		}
	}
	const debounce = (mark, ms) => {
		if (concretized) {
			throw new Error("cannot debounce an already concretized mark")
		}

		marks.push(mark)
		cancel()
		start(ms)
	}
	const isAbstract = () => concretized === false
	const isConcrete = () => concretized

	start(ms)

	return {
		has,
		set,
		cancel,
		isAbstract,
		isConcrete,
		debounce
	}
}

const createLeadingReason = (msSpacingWithReference, interval, first) => {
	if (first) {
		return "first ping"
	}
	return `${msSpacingWithReference}ms ellapsed without ping (more than ${interval}ms interval)`
}
const createMiddleReason = (msSpacingWithReference, interval) =>
	`${msSpacingWithReference}ms ellapsed since previous valid ping (enough regarding ${interval}ms interval)`
const createInsideReason = (msSpacingWithReference, interval) =>
	`${msSpacingWithReference}ms ellapsed since previous valid ping (not enough regarding ${interval}ms interval)`

export const createFrequency = (interval = 0) => {
	let initialMs
	let previousMark
	let referenceMark // could be named previousNonInsideMark
	let trailing
	let cleanup

	const listenTrailing = (fn, reducer) => trailing.set(fn, reducer)
	const listenCleanup = (fn, reducer) => cleanup.set(fn, reducer)

	const reset = () => {
		initialMs = nowMs()
		previousMark = null
		referenceMark = null
		if (trailing) {
			trailing.cancel()
		}
		if (cleanup) {
			cleanup.cancel()
		}
		trailing = null
		cleanup = null
	}
	reset()

	const createMark = () => {
		const ms = nowMs()
		const msSpacingWithReference = ms - (referenceMark ? referenceMark.ms : initialMs)
		const msSpacingWithPrevious = ms - (previousMark ? previousMark.ms : initialMs)
		return {
			listenTrailing,
			listenCleanup,
			ms,
			msSpacingWithReference,
			msSpacingWithPrevious
		}
	}

	const write = mark => {
		const { position } = mark

		if (position !== "trailing" && trailing && trailing.isAbstract()) {
			trailing.debounce(mark, interval - mark.msSpacingWithReference)
		} else {
			trailing = createAbstractMark(mark, interval - mark.msSpacingWithReference, reducedMark =>
				write(
					Object.assign(createMark(), {
						position: "trailing",
						thisValue: reducedMark.thisValue,
						argValues: reducedMark.argValues
					})
				)
			)
		}

		if (position !== "cleanup" && cleanup && cleanup.isAbstract()) {
			cleanup.debounce(mark, interval)
		} else {
			cleanup = createAbstractMark(mark, interval, reducedMark =>
				write(
					Object.assign(createMark(), {
						position: "cleanup",
						thisValue: reducedMark.thisValue,
						argValues: reducedMark.argValues
					})
				)
			)
		}

		// leading/middle/trailing/cleanup are used as referenceMark regarding the interval
		if (position !== "inside") {
			referenceMark = mark
		}

		previousMark = mark
		return mark
	}

	const getPosition = ({ msSpacingWithReference, msSpacingWithPrevious }) => {
		if (referenceMark === null) {
			return {
				position: "leading",
				positionReason: createLeadingReason(msSpacingWithReference, interval, true)
			}
		}

		if (msSpacingWithReference <= interval) {
			return {
				position: "inside",
				positionReason: createInsideReason(msSpacingWithReference, interval)
			}
		}

		if (previousMark && msSpacingWithPrevious < interval) {
			return {
				position: "middle",
				positionReason: createMiddleReason(msSpacingWithReference, interval)
			}
		}

		return {
			position: "leading",
			positionReason: createLeadingReason(msSpacingWithReference, interval)
		}
	}

	const ping = function(...args) {
		const mark = createMark()

		Object.assign(
			mark,
			{
				thisValue: this,
				argValues: args
			},
			getPosition(mark)
		)

		write(mark)

		return mark
	}

	return {
		ping,
		reset
	}
}
