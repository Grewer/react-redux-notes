import './App.css';
import {connect} from "./react-redux/src";
import {bindActionCreators} from "./redux/src";
import {useMemo} from "react";


function increment(value) {
    return {
        type: 'counter/incremented',
        payload: value
    }
}

function decrement(value) {
    return {
        type: 'counter/decremented',
        payload: value
    }
}

function App(props) {
    const {dispatch} = props

    const fn = useMemo(() => bindActionCreators({
        increment,
        decrement
    }, dispatch), [dispatch])

    console.log('App', props, fn)

    return (
        <div className="App">
            <div>
                val: {props.value}
            </div>
            <button onClick={() => {
                fn.increment(100)
            }}>plus
            </button>
        </div>
    );
}

const mapStateToProps = (_state) => {
    return (state) => ({
        value: state.counter.value
    })
}

export default connect(mapStateToProps)(App);
