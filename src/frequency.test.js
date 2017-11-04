// https://github.com/jashkenas/underscore/blob/master/test/functions.js#L197
// here we may want to use sthing like jasmine.clock
// which would change global.setTimeout so that we can tick
// manually, test would be much easier

import { createFrequency } from "./frequency.js"
import { createTest } from "@dmail/test"
import {
	expectChain,
	expectMatch,
	expectCalledOnce,
	expectCalledOnceWith,
	expectNotCalled,
	matchPropertiesDeep,
	matchProperties,
	matchPropertiesAllowingExtra
} from "@dmail/expect"
import { mockExecution } from "micmac"
import { createSpy } from "@dmail/spy"

const expectCalledIn = (tracker, expectedMs) => {
	// todo: tracker.createReport().msCalled - msCreated === expectedMs
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
							position: "leading",
							positionReason: "first ping",
							ms: 0,
							msSpacing: 0
						})
					),
				() => tickRelative(30),
				() =>
					expectMatch(
						ping(),
						matchPropertiesAllowingExtra({
							position: "inside",
							positionReason: `30ms ellapsed since last valid ping (not enough regarding 50ms interval)`,
							ms: 30,
							msSpacing: 30
						})
					),
				() => tickRelative(60),
				() =>
					expectMatch(
						ping(),
						matchPropertiesAllowingExtra({
							position: "middle",
							positionReason: `60ms ellapsed since last valid ping (enough regarding 50ms interval)`,
							ms: 60,
							msSpacing: 30
						})
					),
				() => tickRelative(130),
				() =>
					expectMatch(
						ping(),
						matchPropertiesAllowingExtra({
							position: "leading",
							positionReason: `70ms ellapsed since last ping (more than 50ms interval)`,
							ms: 130,
							msSpacing: 70
						})
					)
			)
		})
	/*
	"trailing state can be listened": () =>
		mockExecution(({ tickAbsolute }) => {
			const { ping } = createFrequency(50)
			const firstPingValue = "foo"
			const firstState = ping(firstPingValue)
			const secondPingValue = 2
			ping(secondPingValue)
			const setSpy = createSpy()
			const reducerSpy = createSpy(handlers => handlers[handlers.length - 1].value)

			firstState.trailing.set(setSpy, reducerSpy)

			return expectChain(
				() => tickAbsolute(150),
				() => expectCalledOnce(reducerSpy),
				() =>
					expectMatch(
						reducerSpy.getReport(0).argValues.map(handler => handler.value.args),
						matchPropertiesDeep([[firstPingValue], [secondPingValue]])
					),
				() =>
					expectCalledOnceWith(
						setSpy,
						matchPropertiesAllowingExtra({
							position: "trailing",
							ms: 100,
							msSpacing: 50,
							args: matchProperties([secondPingValue])
						})
					),
				() => expectCalledIn(setSpy, 100)
			)
		}),
	"trailing state can be unlistened": () =>
		mockExecution(({ tickAbsolute }) => {
			const { ping } = createFrequency(50)
			const setSpy = createSpy()
			const firstState = ping()
			const stopListening = firstState.trailing.set(setSpy)
			ping()
			stopListening()
			tickAbsolute(150)
			return expectNotCalled(setSpy)
		}),
	"trailing state is debounced": () =>
		mockExecution(({ tickAbsolute }) => {
			const { ping } = createFrequency(50)
			const setSpy = createSpy()
			ping().trailing.set(setSpy)

			tickAbsolute(20)
			ping()
			tickAbsolute(60)
			ping()
			tickAbsolute(90)
			ping()
			tickAbsolute(150)
			return expectCalledIn(setSpy, 140)
		})
	*/
	// todo: test that calling state.cleanup() register a function
	// that will get called when ping stop emitting for the given interval
})
