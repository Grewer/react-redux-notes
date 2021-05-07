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
这个文件定义了一个 `createConnect` 函数, 这是用来生成 connect 的:
```js
export function createConnect({
  connectHOC = connectAdvanced,
  mapStateToPropsFactories = defaultMapStateToPropsFactories,
  mapDispatchToPropsFactories = defaultMapDispatchToPropsFactories,
  mergePropsFactories = defaultMergePropsFactories,
  selectorFactory = defaultSelectorFactory,
} = {}) {
  // 返回真正的 connect 函数
  return function connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    {
      pure = true,
      areStatesEqual = strictEqual,
      areOwnPropsEqual = shallowEqual,
      areStatePropsEqual = shallowEqual,
      areMergedPropsEqual = shallowEqual,
      ...extraOptions
    } = {}
  ) {

    // 判断 mapStateToProps 是否符合已经定义的规则
    // mapStateToPropsFactories 可以想象成你对
    // mapStateToProps 做了一些判断, 只要有一个判断符合了
    // 就可以成功返回值
    // mapStateToPropsFactories 的规则会在 react-redux/src/connect/mapStateToProps.js 里讲解
    // 默认的 defaultMapStateToPropsFactories 有两个规则
    // 1. 如果是函数, 会使用 wrapMapToPropsFunc 包裹, 并且直接return结果
    // 2. 如果没有传值, 则会使用 wrapMapToPropsConstant 包裹
    const initMapStateToProps = match(
      mapStateToProps,
      mapStateToPropsFactories,
      'mapStateToProps'
    )

    // 同上 但是 他的默认规则是 defaultMapDispatchToPropsFactories
    // 在 react-redux/src/connect/mapDispatchToProps.js 此文件中
    const initMapDispatchToProps = match(
      mapDispatchToProps,
      mapDispatchToPropsFactories,
      'mapDispatchToProps'
    )

    // 同上
    const initMergeProps = match(mergeProps, mergePropsFactories, 'mergeProps')

    // 包裹组件的高阶函数 connect(mapStateToProps, ...)
    return connectHOC(selectorFactory, {
      // 方便 error messages 打印
      methodName: 'connect',

      // 用于从包装的组件的displayName计算Connect的displayName。
      getDisplayName: (name) => `Connect(${name})`,

      // 如果mapStateToProps 为 falsy，则Connect组件不订阅存储状态更改
      shouldHandleStateChanges: Boolean(mapStateToProps),

      //  传递给 selectorFactory 的参数
      initMapStateToProps,
      initMapDispatchToProps,
      initMergeProps,
      pure,
      areStatesEqual,
      areOwnPropsEqual,
      areStatePropsEqual,
      areMergedPropsEqual,
      //
      ...extraOptions,
    })
  }
}

```

`defaultMapStateToPropsFactories`, `defaultMapDispatchToPropsFactories` , `defaultMergePropsFactories` , `defaultSelectorFactory` 我们会放在下面研究, 现在先知道他是做什么的

同样的, 在这个文件 我们可以看到 connect 的雏形了

真实的执行顺序:  `createConnect()` -> `connect()` -> `connectHOC()` = `connectAdvanced()` -> `wrapWithConnect(Component)`

下一步就是  `connectAdvanced()` 中执行了什么:

#### connectAdvanced

这个我们需要在 `react-redux/src/components/connectAdvanced.js` 这个文件中查看:

`connectAdvanced` 较为复杂, 我们将它分段提取, 首先我们来看他的传参
```js
export default function connectAdvanced(
 // 这些是 connect 第一步中提供的参数
    selectorFactory, // 默认为 defaultSelectorFactory
    // options object:
    {
        //用于从包装的组件的displayName计算此HOC的displayName的函数。
        getDisplayName = (name) => `ConnectAdvanced(${name})`,

        // 在 error message  中显示 容易 debug
        methodName = 'connectAdvanced',

        // 没有太大作用, 后面可能会删除
        renderCountProp = undefined,

        // 确定这个 hoc 是否会监听 store 的改变
        shouldHandleStateChanges = true,

        // 没有太大作用, 后面可能会删除

        storeKey = 'store',
        // 没有太大作用, 后面可能会删除
        withRef = false,

        // 是否使用了 forwardRef
        forwardRef = false,

        // 使用的 Context
        context = ReactReduxContext,

        //额外参数
        ...connectOptions
    } = {}
) {
    // 省略了参数的校验
    const Context = context
    return function wrapWithConnect(WrappedComponent) {
        // ...
    }
}
```

这些参数都是可以在 `createConnect` 中找到, 可以看到 `connectAdvanced` 返回的 `wrapWithConnect`, 就是我们用来正真返回的, 用来包裹组件的函数


#### wrapWithConnect

在 `wrapWithConnect` 也有一个主体函数 `ConnectFunction`, 这里我们先讲除此函数之外的作用

```js
function wrapWithConnect(WrappedComponent) {
        // 省略校检
        const wrappedComponentName =
            WrappedComponent.displayName || WrappedComponent.name || 'Component'

        const displayName = getDisplayName(wrappedComponentName)
        // 上面两行都是获取组件名称 默认(Component)


        const selectorFactoryOptions = {
            ...connectOptions,
            getDisplayName,
            methodName,
            renderCountProp,
            shouldHandleStateChanges,
            storeKey,
            displayName,
            wrappedComponentName,
            WrappedComponent,
        }

        const {pure} = connectOptions // 第一步传递过来的参数  默认为 true

        // 创建子选择器的函数 声明
        function createChildSelector(store) {
            return selectorFactory(store.dispatch, selectorFactoryOptions)
        }


        // 如果 pure 为 false, 则直接指向回调 而不是 useMemo
        const usePureOnlyMemo = pure ? useMemo : (callback) => callback()

        // 当前整个函数的主体部分 接受 props 返回 JSX 并且会用 Context 包裹
        function ConnectFunction(props) {
            // 省略函数主体
        }
        // 通过 pure 来确定是否要加 memo
        const Connect = pure ? React.memo(ConnectFunction) : ConnectFunction

        Connect.WrappedComponent = WrappedComponent
        Connect.displayName = displayName

        // forwardRef 省略

        return hoistStatics(Connect, WrappedComponent)
    }
```



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
