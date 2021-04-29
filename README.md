# react-redux 源码阅读笔记

> react-redux 版本号 7.2.3

react-redux 依赖的库:

```
"dependencies": {
    "@babel/runtime": "^7.12.1",
    "@types/react-redux": "^7.1.16",
    "hoist-non-react-statics": "^3.3.2",
    "loose-envify": "^1.4.0",
    "prop-types": "^15.7.2",
    "react-is": "^16.13.1"
}
```

这里我直接把 react-redux 的源码下载了下来,所以这些依赖就必须手动安装了

注意: **关于 hooks 的解析会放到下一文**

### redux

redux 是一个库,但更是一种思想, 而 react-redux 就是一座桥了, 他连接了两中模式, 现在让我们一探究竟

## 分模块

我们将 redux 使用的流程分成 3 个模块

1. store 的创建

2. provider 提供数据的注入

3. connect 在想要的组件中使用

## 前置知识点

想要理解此中源码首先就需要理解很多 react hooks 的知识点 还有熟练使用 redux 的经验,
这里我就先简介一下

### Subscription

我们要先理解一个设计模式 - 订阅发布模式
他位于文件: react-redux/src/utils/Subscription.js
具体的代码我们会在后面细说

### hooks

关于 hooks 中 我们需要了解到的知识点:

- useMemo  
  缓存代码的过程, 如果依赖不变则, 直接返回结果

- useContext  
  在函数中使用 context 的方案

- useRef  
  最开始是用来获取 ref 的, 后面也用来存储变量

- useReducer  
  创建一个小的 reducer, 当然也有他自己的 state 和 dispatch

具体的知识点还需要去官网了解:  https://zh-hans.reactjs.org/docs/hooks-intro.html

## store

关于 store 的创建

store 使用的主要就是 redux 的 api, 不管 `combineReducers` 还是 `createStore`

关于 redux 的 store  提供了以下 API:

```
export interface Store<S = any, A extends Action = AnyAction> {
   
   // dispatch 的动作
  dispatch: Dispatch<A>
    
  // 返回应用程序的当前状态树。
  getState(): S

   // 添加更改侦听器。每当分派动作时，都会调用它，并且状态树的某些部分可能已更改。然后，您可以调用`getState（）`来读取回调中的当前状态树。
  subscribe(listener: () => void): Unsubscribe

   // 替换 reducer
  replaceReducer(nextReducer: Reducer<S, A>): void
}

```

## provider

### provider 的使用

TODO

### 文件源码入口
可以查看文件: `react-redux/src/components/Provider.js`

```
//...

// Provider 主体, 是一个组件, 通常在项目的入口使用
function Provider({ store, context, children }) {

  const contextValue = useMemo(() => {
    // 创建了一个订阅模式, 值为 store
    // 赋值 onStateChange 为 notifyNestedSubs,  作用 绑定了 store, 如果 store 值发生了变化 则执行 listener 里的所并回调
    const subscription = new Subscription(store)
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription,
    }
  }, [store])


  // 用来获取store 的值  记录,作为对比
  const previousState = useMemo(() => store.getState(), [store])

  // useIsomorphicLayoutEffect 等于 useLayoutEffect
  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue

    // 在 provider 里面 对于 store 添加 onStateChange 回调, 相当于 subscribe 包裹了一层函数, 这一层的作用后面会体现在 connect 中
    // 除了添加回调  还初始化了 listeners subscribe 事件的机制
    subscription.trySubscribe()

    if (previousState !== store.getState()) {
      // 当知青储存的值和当前值不一致时  触发 listeners 里的回调
      subscription.notifyNestedSubs()
    }
    return () => {
      // 解除事件的监听
      subscription.tryUnsubscribe()
      subscription.onStateChange = null
    }
  }, [contextValue, previousState])

  // context, 如果外部提供了 则使用外部的 
  const Context = context || ReactReduxContext

  // 就是 context 的 provider
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}
// ...
```

到这里我们就碰到了 `Subscription` 了, 现在需要知道的两点:
1. 通过 `subscription.addNestedSub(listener)` 函数, 添加监听事件
2. 通过 `subscription.notifyNestedSubs()`, 触发之前所有的监听事件
3. `subscription.trySubscribe()` 属于第一点中函数的子函数, 效果出来不能添加回调以外,类似
4. `subscription.tryUnsubscribe()`, 与第三点相反, 解除监听

现在, 我们罗列下 Provider 做了什么事情:
1. 创建了 context 需要传递的值
2. 记录之前 store 的值
3. 当前 store 值和之前记录的不一样时, 触发监听事件


## connect
真正的重头戏来了, 将 redux 的 store 与任意的组件连接

### connect 的使用

#### connect 参数
在这里我们首先需要知道的是 `connect` , 通过他是怎么使用的, 倒推回去看源码会更有帮助 
他的定义:
```
function connect(mapStateToProps?, mapDispatchToProps?, mergeProps?, options?)
```

可以看到`connect` 可接受 4 个参数

1. mapStateToProps:
```
mapStateToProps?: (state, ownProps?) => Object
```
他是一个函数, 接受 state 和 ownProps 两个参数,  返回一个对象,
如果 mapStateToProps 传递的是一个函数, 那么 store 更新的时候,包装的组件也会订阅更新
如果传递 undefined 或者 null, 可以避免不需要的更新

关于 `ownProps` 的用法, ownProps 其实就是组件的 props 
``` 
const mapStateToProps = (state, ownProps) => ({
  todo: state.todos[ownProps.id],
})
```

2. mapDispatchToProps
```
mapDispatchToProps?: Object | (dispatch, ownProps?) => Object
```
第二个参数, 可以是函数, 可以是对象, 也可以是空值
如果是函数, 则可以收取到两个参数, `dispatch` 和 `ownProps`
通常我们是这样做的:
``` 
const mapDispatchToProps = (dispatch) => {
return {
    increment: () => dispatch({ type: 'INCREMENT' }),
    decrement: () => dispatch({ type: 'DECREMENT' }),
  }
}
```
ownProps 的用法和 mapStateToProps 相同
当前参数如果是一个对象的时候, 需要控制里面的属性都是 [action-creator](https://redux.js.org/understanding/thinking-in-redux/glossary#action-creator)
在源码中将会调用: `bindActionCreators(mapDispatchToProps, dispatch)` 来生成可用代码
官网中的简介: [点击查看](https://react-redux.js.org/using-react-redux/connect-mapdispatch#defining-mapdispatchtoprops-as-an-object)

3. mergeProps
``` 
mergeProps?: (stateProps, dispatchProps, ownProps) => Object
```
这个参数的作用就是, 当前 connect 包装的组件, 对于他的 props 再次自定义
,如不传递这个属性, 则代码中默认传递值为: `{ ...ownProps, ...stateProps, ...dispatchProps }`

4. options
```
options?: Object
```
Object 中的内容:
``` 
{
  context?: Object,
  pure?: boolean,
  areStatesEqual?: Function,
  areOwnPropsEqual?: Function,
  areStatePropsEqual?: Function,
  areMergedPropsEqual?: Function,
  forwardRef?: boolean,
}
```
只有版本再 >=6.0 的时候才会有这个属性, 都是配置性的属性, 一般来说默认值就能应付 99% 的情况了
更加具体的作用可以在此处点击查看: [点击查看](https://react-redux.js.org/api/connect#options-object)

#### connect 返回结果:

这是一个普通的用法:

```
connect(mapStateToProps, mapDispatchToProps)(App);
```

不难理解,  connect 作为一个高阶函数, 返回的也是一个函数, 所以才会是这种用法

``` 
const connect = (mapStateToProps, mapDispatchToProps)=>{
  return (Component) => {
    return  <Conponent /> 
  }
}
```
具体应该就是这样, 现在带着我们的理解和疑问再来进入 connect 源码

### 文件源码入口:

查看 connect 的入口文件 `src/connect/connect` :  



## 其他

## 入口文件 src/index.js

```
//...
setBatch(batch)

export {
//...
}
```

基本上都是把 export 的方法引入, 统一再这个文件导出, 但是其中也执行了一个函数: `setBatch(batch)`

#### setBatch

`setBatch` 来源于`./utils/batch` 文件:

```
// Default to a dummy "batch" implementation that just runs the callback
function defaultNoopBatch(callback) {
callback()
}

let batch = defaultNoopBatch

// Allow injecting another batching function later
export const setBatch = (newBatch) => (batch = newBatch)

// Supply a getter just to skip dealing with ESM bindings
export const getBatch = () => batch
```

简单的来说就是, 此文件中存储了一个变量 batch, 对外输出了 2 个函数, 设置此变量和获取此变量



## 结语



参考文档:
https://react-redux.js.org/introduction/getting-started
https://github.com/reduxjs/react-redux
