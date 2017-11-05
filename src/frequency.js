/*
pace, cadency, tempo, rythm, edge, range, delimiter
enter, leave, start, end

*/

// const logEnabled = false
// const log = (...args) => (logEnabled ? console.log(...args) : null)

const nowMs = () => Number(new Date())
const reduceToLast = (...marks) => marks[marks.length - 1]
const createTooLateMessage = (msEllapsedBeforeCallingListen, msMissingToReachStep) =>
	`too late to call listenStep, ${msEllapsedBeforeCallingListen}ms ellapsed and you had ${msMissingToReachStep}ms`

// I've made this so ensure fn is never called too early by a setTimeout
// because I fear it would lead to something strange if we assumed step is reached
// while in fact we are like 2 or 3ms in advance
// and other parts of the code assume we are on the previous step
const setTimeoutNeverInAdvance = (fn, ms) => {
	const msBeforeTimeout = nowMs()
	let timeout
	const checkAndCallback = () => {
		const msAfterTimeout = nowMs()
		const ellapsedMs = msAfterTimeout - msBeforeTimeout
		if (ellapsedMs < ms) {
			timeout = setTimeout(checkAndCallback, ms - ellapsedMs)
		} else {
			fn(msAfterTimeout, ellapsedMs - ms)
		}
	}
	timeout = setTimeout(checkAndCallback, ms)
	return () => clearTimeout(timeout)
}

export const createFrequency = (interval = 0) => {
	let previousMark
	let startMark

	let currentStepId
	const stepListeners = []
	const createListenStep = mark => {
		const msMissingToReachStep =
			startMark === null ? interval : interval - (mark.ms - startMark.ms) % interval
		const stepId = startMark === null ? 0 : Math.floor(mark.ms - startMark.ms / interval)
		const marks = []
		if (stepId === currentStepId) {
			stepListeners.forEach(stepListener => stepListener.addMark(mark))
			const previousStepListener = stepListeners[stepListeners.length - 1]
			if (previousStepListener) {
				marks.push(...previousStepListener.cloneMarks())
			} else {
				marks.push(mark)
			}
		} else {
			stepListeners.length = 0
			currentStepId = stepId
			marks.push(mark)
		}

		const addMark = mark => marks.push(mark)
		const cloneMarks = () => marks.slice()
		const stepListener = {
			addMark,
			cloneMarks
		}
		stepListeners.push(stepListener)

		const listenStep = (fn, reducer = reduceToLast) => {
			const listenMs = nowMs()
			const msEllapsedBeforeCallingListen = listenMs - mark.ms
			if (msEllapsedBeforeCallingListen > msMissingToReachStep) {
				throw new Error(createTooLateMessage(msEllapsedBeforeCallingListen, msMissingToReachStep))
			}
			const remaingMsMissingToReachStep = msMissingToReachStep - msEllapsedBeforeCallingListen
			return setTimeoutNeverInAdvance((ms, msExtra) => {
				// in case we are so late that in fact we are already on an other step juste give up
				if (msExtra > interval) {
					return
				}
				const reducedMark = Object.assign({}, reducer(...marks), {
					ms,
					msSpacingWithPrevious: ms - previousMark.ms,
					msSpacingWithStart: ms - startMark.ms,
					msExtra,
					type: "step"
				})
				reducedMark.listenStep = createListenStep(reducedMark)
				fn(reducedMark)
			}, remaingMsMissingToReachStep)
		}
		return listenStep
	}

	const reset = () => {
		previousMark = null
		startMark = null
	}
	reset()

	const ping = function(...args) {
		const thisValue = this
		const argValues = args
		const pingMs = nowMs()
		let msSpacingWithPrevious
		let msSpacingWithStart
		let type
		if (previousMark === null) {
			type = "start"
		} else {
			msSpacingWithPrevious = pingMs - previousMark.ms
			msSpacingWithStart = pingMs - startMark.ms
			type = msSpacingWithPrevious > interval ? "start" : "keepalive"
		}

		const mark = {}
		Object.assign(mark, {
			thisValue,
			argValues,
			ms: pingMs,
			msSpacingWithPrevious,
			msSpacingWithStart,
			type
		})
		mark.listenStep = createListenStep(mark)

		if (type === "start") {
			startMark = mark
		}
		previousMark = mark

		return mark
	}

	return {
		ping,
		reset
	}
}
