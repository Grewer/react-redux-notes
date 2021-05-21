import {createStore} from 'redux'

function counterReducer(state, action) {
    switch (action.type) {
        case 'counter/incremented':
            return {value: state.value + 1}
        case 'counter/decremented':
            return {value: state.value - 1}
        default:
            return state
    }
}


let store = createStore(counterReducer, {
    value: 12345
})

const unsubscribe = store.subscribe(() => {
    console.log('listener run')
    const current = store.getState()
    if (current.value === 12350) {
        unsubscribe()
    }
})

export default store
