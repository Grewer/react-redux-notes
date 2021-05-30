import {createStore} from '../redux/src/index'
import {applyMiddleware, combineReducers} from "../redux/src";

function counterReducer(state = {value: 0}, action) {
    switch (action.type) {
        case 'counter/incremented':
            return {value: state.value + 1}
        case 'counter/decremented':
            return {value: state.value - 1}
        default:
            return state
    }
}

function todoReducer(state = {list: []}, action) {
    switch (action.type) {
        case 'todo/add':
            return {list: state.list.concat(action.payload)}
        case 'todo/remove':
            state.list.splice(action.payload, 1)
            return {...state}
        default:
            return state
    }
}

const rootReducer = combineReducers({
    todo: todoReducer,
    counter: counterReducer
})

function logger({getState}) {
    return next => action => {
        console.log('will dispatch', action)

        const returnValue = next(action)

        console.log('state after dispatch', getState())

        return returnValue
    }
}

let store = createStore(rootReducer, {
    counter: {value: 12345}
}, applyMiddleware(logger))

console.log(store)

const unsubscribe = store.subscribe(() => {
    console.log('listener run')
    const current = store.getState()
    if (current.value === 12350) {
        unsubscribe()
    }
})

export default store
