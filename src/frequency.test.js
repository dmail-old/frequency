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
	matchPropertiesDeep,
	matchPropertiesAllowingExtra
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
	"leading/inside/middle basic ping": () =>
		mockExecution(({ setTimeReference, tickRelative }) => {
			setTimeReference(0)
			const { ping } = createFrequency(50)

			return expectChain(
				() =>
					expectMatch(
						ping(),
						matchPropertiesAllowingExtra({
							ms: 0,
							msSpacingWithPrevious: 0,
							position: "leading",
							positionReason: "first ping"
						})
					),
				() => tickRelative(30),
				() =>
					expectMatch(
						ping(),
						matchPropertiesAllowingExtra({
							ms: 30,
							msSpacingWithPrevious: 30,
							position: "inside",
							positionReason: `30ms ellapsed since previous valid ping (not enough regarding 50ms interval)`
						})
					),
				() => tickRelative(60),
				() =>
					expectMatch(
						ping(),
						matchPropertiesAllowingExtra({
							ms: 60,
							msSpacingWithPrevious: 30,
							position: "middle",
							positionReason: `60ms ellapsed since previous valid ping (enough regarding 50ms interval)`
						})
					),
				() => tickRelative(130),
				() =>
					expectMatch(
						ping(),
						matchPropertiesAllowingExtra({
							ms: 130,
							msSpacingWithPrevious: 70,
							position: "leading",
							positionReason: `70ms ellapsed without ping (more than 50ms interval)`
						})
					)
			)
		}),
	"listenTrailing()": () =>
		mockExecution(({ setTimeReference, tickRelative }) => {
			setTimeReference()
			const { ping } = createFrequency(50)
			const firstPingValue = "foo"
			const secondPingValue = 2
			const firstMark = ping(firstPingValue)
			const secondMark = ping(secondPingValue)
			const trailingSpy = createSpy("trailing")
			const reducerSpy = createSpy((...marks) => marks[marks.length - 1])
			firstMark.listenTrailing(trailingSpy, reducerSpy)

			return expectChain(
				() => tickRelative(150),
				() => expectCalledOnceWith(reducerSpy, firstMark, secondMark),
				() =>
					expectCalledOnceWith(
						trailingSpy,
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: [secondPingValue],
							position: "trailing",
							ms: 150,
							msSpacingWithPrevious: 150,
							msSpacingWithReference: 150,
							listenTrailing: matchFunction(),
							listenCleanup: matchFunction()
						})
					),
				() => expectCalledIn(trailingSpy, 150)
			)
		}),
	"listenTrailing() can be unlistened": () =>
		mockExecution(({ tickRelative }) => {
			const { ping } = createFrequency(50)
			const trailingSpy = createSpy()
			const firstState = ping()
			const stopListening = firstState.listenTrailing(trailingSpy)
			stopListening()
			tickRelative(150)
			return expectNotCalled(trailingSpy)
		}),
	"trailing state is debounced": () =>
		mockExecution(({ setTimeReference, tickRelative }) => {
			setTimeReference()
			const { ping } = createFrequency(50)
			const trailingSpy = createSpy("trailing")
			ping().listenTrailing(trailingSpy)

			tickRelative(20)
			ping("a")
			tickRelative(30)
			ping("b")
			tickRelative(50)
			return expectChain(
				() =>
					expectCalledOnceWith(
						trailingSpy,
						matchPropertiesDeep({
							thisValue: undefined,
							argValues: ["b"],
							ms: 50,
							msSpacingWithPrevious: 20,
							msSpacingWithReference: 50,
							position: "trailing",
							listenTrailing: matchFunction(),
							listenCleanup: matchFunction()
						})
					),
				() => expectCalledIn(trailingSpy, 50)
			)
		})
	// à tester : lorsque trailing et cleanup se produisent en même temps voir ce qu'on fait
	// je pense qu'il faudrais alors redelay le cleanup d'autant
	// sauf qu'il sera marqué comme concrétiser non?
	// à voir peut être que non et du coup il est debounce par le trailing comme on le souhaite
	// tester state.listenCleanup()
})
