import {createStore} from '../redux/src/index'
import {combineReducers} from "../redux/src";

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

function todoReducer(state = [], action) {
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

let store = createStore(rootReducer, {
    counter: {value: 12345}
})

console.log(store)

const unsubscribe = store.subscribe(() => {
    console.log('listener run')
    const current = store.getState()
    if (current.value === 12350) {
        unsubscribe()
    }
})

export default store
