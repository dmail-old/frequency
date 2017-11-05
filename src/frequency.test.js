// https://github.com/jashkenas/underscore/blob/master/test/functions.js#L197
// here we may want to use sthing like jasmine.clock
// which would change global.setTimeout so that we can tick
// manually, test would be much easier

import { createFrequency } from "./frequency.js"
import { createTest } from "@dmail/test"
import {
	expectChain,
	expectMatch,
	expectCalled,
	matchFunction,
	expectCalledOnceWith,
	expectNotCalled,
	matchProperties,
	matchPropertiesDeep,
	matchPropertiesAllowingExtra,
	expectThrowWith,
	matchError
} from "@dmail/expect"
import { mockExecution } from "micmac"
import { createSpy } from "@dmail/spy"

const expectCalledIn = (spy, expectedMs) => {
	const tracker = spy.track(0)
	return expectCalled(tracker).then(() => {
		const { msCreated, msCalled } = tracker.createReport()
		const actualMs = msCalled - msCreated
		return expectMatch(actualMs, expectedMs).then(
			null,
			() => `expect ${spy} to be called in ${expectedMs} but was called in ${actualMs}`
		)
	})
}

export default createTest({
	"start/keepalive/keppalive/start": () =>
		mockExecution(({ setTimeReference, tickRelative }) => {
			setTimeReference(0)
			const { ping } = createFrequency(50)

			return expectChain(
				() =>
					expectMatch(
						ping(),
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: [],
							ms: 0,
							msSpacingWithPrevious: undefined,
							msSpacingWithStart: undefined,
							type: "start",
							listenStep: matchFunction()
						})
					),
				() => tickRelative(30),
				() =>
					expectMatch(
						ping(),
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: [],
							ms: 30,
							msSpacingWithPrevious: 30,
							msSpacingWithStart: 30,
							type: "keepalive",
							listenStep: matchFunction()
						})
					),
				() => tickRelative(80),
				() =>
					expectMatch(
						ping(),
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: [],
							ms: 80,
							// même lorsque le spacing est 50 pour une fréquence de 50
							// c'est un keepalive et non pas un start, c'est vraiment
							// quand la fréquence est dépassé qu'on passe en start
							msSpacingWithPrevious: 50,
							msSpacingWithStart: 80,
							type: "keepalive",
							listenStep: matchFunction()
						})
					),
				() => tickRelative(140),
				() =>
					expectMatch(
						ping(),
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: [],
							ms: 140,
							msSpacingWithPrevious: 60,
							msSpacingWithStart: 140,
							type: "start",
							listenStep: matchFunction()
						})
					)
			)
		}),
	"listenStep()": () =>
		mockExecution(({ setTimeReference, tickRelative }) => {
			// ici on s'assure qu'on peut utiliser listenStep pour appeler une fonction
			// avec le résultat combiné des ping s'étant produits avant
			// on peut voir que le reducer a le droit d'être différent

			setTimeReference()
			const { ping } = createFrequency(50)
			const firstPingValue = "foo"
			const secondPingValue = 2
			const firstMark = ping(firstPingValue)
			const secondMark = ping(secondPingValue)
			const firstStepSpy = createSpy("step")
			const firstReducerSpy = createSpy((...marks) => marks[marks.length - 1])
			firstMark.listenStep(firstStepSpy, firstReducerSpy)
			const secondStepSpy = createSpy("step")
			const secondReducerSpy = createSpy((...marks) => marks[0])
			secondMark.listenStep(secondStepSpy, secondReducerSpy)

			return expectChain(
				() => tickRelative(52),
				() => expectCalledOnceWith(firstReducerSpy, firstMark, secondMark),
				() =>
					expectCalledOnceWith(
						firstStepSpy,
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: [secondPingValue],
							ms: 52,
							msSpacingWithPrevious: 52,
							msSpacingWithStart: 52,
							msExtra: 2,
							type: "step",
							listenStep: matchFunction()
						})
					),
				() => expectCalledIn(firstStepSpy, 52),
				() => expectCalledOnceWith(secondReducerSpy, firstMark, secondMark),
				() =>
					expectCalledOnceWith(
						secondStepSpy,
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: [firstPingValue],
							ms: 52,
							msSpacingWithPrevious: 52,
							msSpacingWithStart: 52,
							msExtra: 2,
							type: "step",
							listenStep: matchFunction()
						})
					),
				() => expectCalledIn(secondStepSpy, 52)
			)
		}),
	"listenStep() can be unlistened": () =>
		mockExecution(({ tickRelative }) => {
			const { ping } = createFrequency(50)
			const stepSpy = createSpy()
			const firstMark = ping()
			const stopListening = firstMark.listenStep(stepSpy)
			stopListening()
			tickRelative(100)
			return expectNotCalled(stepSpy)
		}),
	"listenStep() inside listenStep()": () =>
		mockExecution(({ tickRelative }) => {
			const { ping } = createFrequency(50)
			const mark = ping()
			const firstStepSpy = createSpy()
			mark.listenStep(firstStepSpy)
			tickRelative(50)
			return expectChain(
				() =>
					expectCalledOnceWith(
						firstStepSpy,
						matchPropertiesAllowingExtra({
							type: "step"
						})
					),
				() => {
					const stepMark = firstStepSpy.getReport(0).argValues[0]
					const secondStepSpy = createSpy()
					stepMark.listenStep(secondStepSpy)
					tickRelative(100)
					return expectCalledOnceWith(
						secondStepSpy,
						matchPropertiesAllowingExtra({
							type: "step"
						})
					)
				}
			)
		}),
	"listenStep() called exactly on time then an other too late": () =>
		mockExecution(({ tickRelative }) => {
			const { ping } = createFrequency(50)
			ping()
			tickRelative(20)
			const mark = ping()
			tickRelative(50)
			mark.listenStep(() => {}) // does not throw
			tickRelative(51)
			return expectThrowWith(
				() => mark.listenStep(() => {}),
				matchError(
					matchProperties({
						message: "too late to call listenStep, 31ms ellapsed and you had 30ms"
					})
				)
			)
		}),
	"listenStep() a first mark, then an other mark listenStep()": () =>
		mockExecution(({ tickRelative }) => {
			const { ping } = createFrequency(50)
			const mark = ping()
			mark.listenStep(() => {})
			tickRelative(50)
			const secondMark = ping()
			const secondStepSpy = createSpy()
			secondMark.listenStep(secondStepSpy)
			return expectChain(
				() => expectNotCalled(secondStepSpy),
				() => tickRelative(100),
				() =>
					expectCalledOnceWith(
						secondStepSpy,
						matchPropertiesAllowingExtra({
							type: "step"
						})
					)
			)
		})

	// à faire et à tester : listenEnd()
	// en gros comme step mais end est toujours décalé de l'intervalle
})
