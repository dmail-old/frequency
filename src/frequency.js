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

	start(ms)

	return {
		has,
		set,
		cancel,
		isAbstract,
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

	const createMark = properties => {
		const mark = {}
		const ms = nowMs()
		let msSpacing
		if (previousMark) {
			msSpacing = ms - previousMark.ms
		} else {
			msSpacing = ms - initialMs
		}

		Object.assign(mark, properties, {
			ms,
			msSpacing
		})

		return mark
	}

	const write = mark => {
		const { position } = mark

		if (position === "trailing" || position === "cleanup") {
			trailing = null
		} else if (trailing && trailing.isAbstract()) {
			trailing.debounce(mark, interval - mark.msSpacing)
		} else {
			trailing = createAbstractMark(mark, interval - mark.msSpacing, reducedMark =>
				write(
					createMark({
						position: "trailing",
						thisValue: reducedMark.thisValue,
						args: reducedMark.args
					})
				)
			)
		}

		if (position === "cleanup") {
			cleanup = null
		} else if (cleanup && cleanup.isAbstract()) {
			cleanup.debounce(mark, interval)
		} else {
			cleanup = createAbstractMark(mark, interval, reducedMark =>
				write(
					createMark({
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
		const mark = createMark({
			thisValue: this,
			args: arguments
		})
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

		mark.position = position
		mark.positionReason = positionReason

		return write(mark)
	}

	return {
		ping,
		reset
	}
}
