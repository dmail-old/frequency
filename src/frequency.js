const nowMs = () => Number(new Date())
const logEnabled = false
const log = (...args) => (logEnabled ? console.log(...args) : null)
const reduceValuesFromLast = handlers => handlers[handlers.length - 1].value

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
	const set = (fn, secondFn = reduceValuesFromLast) => {
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

const createLeadingReason = (msSpacing, interval, first) => {
	if (first) {
		return "first ping"
	}
	return `${msSpacing}ms ellapsed since last ping (more than ${interval}ms interval)`
}
const createMiddleReason = (msSpacingWithReference, interval) =>
	`${msSpacingWithReference}ms ellapsed since last valid ping (enough regarding ${interval}ms interval)`
const createInsideReason = (msSpacingWithReference, interval) =>
	`${msSpacingWithReference}ms ellapsed since last valid ping (not enough regarding ${interval}ms interval)`

export const createFrequency = (interval = 0) => {
	let initialMs
	let previousMark
	let referenceMark
	let trailing
	let cleanup

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
		return {
			ms,
			msSpacing: ms - (previousMark ? previousMark.ms : initialMs)
		}
	}

	const write = mark => {
		const { position } = mark

		if (position !== "trailing" && trailing && trailing.isAbstract()) {
			trailing.debounce(mark, interval - mark.msSpacing)
		} else {
			trailing = createAbstractMark(mark, interval - mark.msSpacing, reducedMark =>
				write(
					Object.assign(createMark(), {
						position: "trailing",
						thisValue: reducedMark.thisValue,
						args: reducedMark.args
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
						args: reducedMark.args
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

	const ping = function() {
		const mark = createMark()
		const { ms, msSpacing } = mark
		let position
		let positionReason

		log(`invokation (relativeMs ${msSpacing}ms)`)

		if (referenceMark === null || msSpacing > interval) {
			log(`-> position: leading`)
			position = "leading"
			positionReason = createLeadingReason(msSpacing, interval, referenceMark === null)
		} else {
			const msSpacingWithReference = ms - referenceMark.ms
			const intervalIsEllapsed = msSpacingWithReference > interval

			if (intervalIsEllapsed) {
				log(`-> position: middle`)
				position = "middle"
				positionReason = createMiddleReason(msSpacingWithReference, interval)
			} else {
				log("-> inside (too fast)")
				position = "inside"
				positionReason = createInsideReason(msSpacingWithReference, interval)
			}
		}

		const listenTrailing = (fn, reducer) => trailing.set(fn, reducer)
		const listenCleanup = (fn, reducer) => cleanup.set(fn, reducer)

		Object.assign(mark, {
			position,
			positionReason,
			listenTrailing,
			listenCleanup
		})

		write(mark)

		return mark
	}

	return {
		ping,
		reset
	}
}
