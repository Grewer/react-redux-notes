import './App.css';
import {connect} from "./react-redux/src";

function App(props) {
    console.log('App', props)
    return (
        <div className="App">
            <div>
                val: {props.value}
            </div>
            <button onClick={() => {
                props.dispatch({type: 'counter/incremented'})
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
