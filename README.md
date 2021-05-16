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

想要理解此中源码首先就需要理解很多 react hooks 的知识点 还有熟练使用 redux 的经验, 这里我就先简介一下

### Subscription

我们要先理解一个设计模式 - 订阅发布模式 他位于文件: react-redux/src/utils/Subscription.js 具体的代码我们会在后面细说

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

关于 redux 的 store 提供了以下 API:

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

在这里我们首先需要知道的是 `connect` , 通过他是怎么使用的, 倒推回去看源码会更有帮助 他的定义:

```
function connect(mapStateToProps?, mapDispatchToProps?, mergeProps?, options?)
```

可以看到`connect` 可接受 4 个参数

1. mapStateToProps:

```
mapStateToProps?: (state, ownProps?) => Object
```

他是一个函数, 接受 state 和 ownProps 两个参数, 返回一个对象, 如果 mapStateToProps 传递的是一个函数, 那么 store 更新的时候,包装的组件也会订阅更新 如果传递 undefined 或者
null, 可以避免不需要的更新

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

第二个参数, 可以是函数, 可以是对象, 也可以是空值 如果是函数, 则可以收取到两个参数, `dispatch` 和 `ownProps`
通常我们是这样做的:

``` 
const mapDispatchToProps = (dispatch) => {
return {
    increment: () => dispatch({ type: 'INCREMENT' }),
    decrement: () => dispatch({ type: 'DECREMENT' }),
  }
}
```

ownProps 的用法和 mapStateToProps 相同 当前参数如果是一个对象的时候,
需要控制里面的属性都是 [action-creator](https://redux.js.org/understanding/thinking-in-redux/glossary#action-creator)
在源码中将会调用: `bindActionCreators(mapDispatchToProps, dispatch)` 来生成可用代码
官网中的简介: [点击查看](https://react-redux.js.org/using-react-redux/connect-mapdispatch#defining-mapdispatchtoprops-as-an-object)

3. mergeProps

``` 
mergeProps?: (stateProps, dispatchProps, ownProps) => Object
```

这个参数的作用就是, 当前 connect 包装的组件, 对于他的 props 再次自定义 ,如不传递这个属性, 则代码中默认传递值为: `{ ...ownProps, ...stateProps, ...dispatchProps }`

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

不难理解, connect 作为一个高阶函数, 返回的也是一个函数, 所以才会是这种用法

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

`defaultMapStateToPropsFactories`, `defaultMapDispatchToPropsFactories` , `defaultMergePropsFactories`
, `defaultSelectorFactory` 我们会放在下面研究, 现在先知道他是做什么的

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
    // 将 WrappedComponent 和  connectAdvanced中的参数集合在了一起

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

#### hoistStatics

这里要说下 `hoistStatics` , 他来自于 `hoist-non-react-statics` 这个库  
简单的来说可以看成 `Object.assign`, 但是他是组件级别的

#### ConnectFunction

`ConnectFunction` 可以说是经过上一步的包装之后 真正在执行中的函数

```js
function ConnectFunction(props) {
    const [
        propsContext,
        reactReduxForwardedRef,
        wrapperProps,
    ] = useMemo(() => {
        // 区分传递给包装器组件的实际“数据”属性和控制行为所需的值（转发的引用，备用上下文实例）。
        // 要维护wrapperProps对象引用，缓存此解构。
        // 此处使用的是官方注释
        const {reactReduxForwardedRef, ...wrapperProps} = props
        return [props.context, reactReduxForwardedRef, wrapperProps]
    }, [props])

    const ContextToUse = useMemo(() => {
        // 用户可以选择传入自定义上下文实例来代替我们的ReactReduxContext使用。
        // 记住确定应该使用哪个上下文实例的检查。
        // 此处使用的是官方注释
        return propsContext &&
        propsContext.Consumer &&
        isContextConsumer(<propsContext.Consumer/>)
            ? propsContext
            : Context
    }, [propsContext, Context])

    // useContext 不用多说
    const contextValue = useContext(ContextToUse)
    // 到此处位置都是 context 的预备工作


    // store 必须存在于 props 或 context
    // 我们将首先检查它是否看起来像 Redux store。
    // 这使我们可以通过一个 “store” props，该 props 只是一个简单的值。
    const didStoreComeFromProps =
        Boolean(props.store) &&
        Boolean(props.store.getState) &&
        Boolean(props.store.dispatch)

    // 确认 store 是否来自于本地 context
    const didStoreComeFromContext =
        Boolean(contextValue) && Boolean(contextValue.store)

    //省略报错判断

    // 获取 store  赋值
    const store = didStoreComeFromProps ? props.store : contextValue.store
    // 到这是 store 的判断


    const childPropsSelector = useMemo(() => {
        // 子道具选择器需要store参考作为输入。每当store更改时，则重新创建此选择器。
        return createChildSelector(store)
    }, [store])

    const [subscription, notifyNestedSubs] = useMemo(() => {
        // 确定这个 hoc 是否会监听 store 的改变 默认为 true
        if (!shouldHandleStateChanges) return NO_SUBSCRIPTION_ARRAY // [null, null]

        // new 一个新的 Subscription
        // 此订阅的来源应与存储来自何处相匹配：store vs context。
        // 通过 props 连接到 store 的组件不应使用 context 订阅，反之亦然。
        // 文件来源 react-redux/src/utils/Subscription.js
        const subscription = new Subscription(
            store,
            didStoreComeFromProps ? null : contextValue.subscription
        )

        // `notifyNestedSubs`是重复的，以处理组件在通知循环中间被取消订阅的情况，
        // 此时`subscription`将为空。 如果修改Subscription的监听器逻辑，
        // 不在通知循环中间调用已取消订阅的监听器，就可以避免这种情况。
        // 此处使用的是官方注释
        const notifyNestedSubs = subscription.notifyNestedSubs.bind(
            subscription
        )

        return [subscription, notifyNestedSubs]
    }, [store, didStoreComeFromProps, contextValue])

    // 如果需要的话，确定应该把什么{store，subscription}值放到嵌套的context中
    // ，并将该值备忘，以避免不必要的上下文更新。
    const overriddenContextValue = useMemo(() => {
        if (didStoreComeFromProps) {
            // 这个组件是直接从props订阅一个存储.
            // 我们不希望子孙从这个存储中读取--无论现有的上下文值是来自最近的连接祖先的什么，
            // 都会传下来。
            return contextValue
        }

        // 否则，把这个组件的订阅实例放到上下文中，这样连接的子孙就不会更新，直到这个组件完成之后。
        return {
            ...contextValue,
            subscription,
        }
    }, [didStoreComeFromProps, contextValue, subscription])

    // 每当 Redux store 更新导致计算出的子组件 props 发生变化时，我们需要强制这个包装组件重新渲染（或者我们在mapState中发现了一个错误）。
    const [
        [previousStateUpdateResult],
        forceComponentUpdateDispatch,
    ] = useReducer(storeStateUpdatesReducer, EMPTY_ARRAY, initStateUpdates)

    // 抛出任何 mapState/mapDispatch 错误。
    if (previousStateUpdateResult && previousStateUpdateResult.error) {
        throw previousStateUpdateResult.error
    }

    // 设置 ref，以协调订阅效果和渲染逻辑之间的数值。
    // 参考 通过 ref 可以获取,存储值
    const lastChildProps = useRef()
    const lastWrapperProps = useRef(wrapperProps)
    const childPropsFromStoreUpdate = useRef()
    const renderIsScheduled = useRef(false)

    const actualChildProps = usePureOnlyMemo(() => {
        // 这里的逻辑很复杂:
        // 这个渲染可能是由 Redux store 更新所触发，产生了新的子 props。
        // 不过，在那之后，我们可能会得到新的包装 props。
        // 如果我们有新的子 props ，和相同的包装 props , 我们知道我们应该按原样使用新的子 props .
        // 但是，如果我们有新的包装props，这些可能会改变子 props ，所以我们必须重新计算这些.
        // 所以，只有当包装 props 和上次一样时，我们才会使用 store 更新的子 props。
        if (
            childPropsFromStoreUpdate.current &&
            wrapperProps === lastWrapperProps.current
        ) {
            return childPropsFromStoreUpdate.current
        }

        // 这很可能会导致在并发模式下发生坏事（TM）。
        // 请注意，我们之所以这样做是因为在由存储更新引起的渲染中，
        // 我们需要最新的存储状态来确定子 props 应该是什么。
        return childPropsSelector(store.getState(), wrapperProps)
    }, [store, previousStateUpdateResult, wrapperProps])

    // 我们需要在每次重新渲染时同步执行。
    // 然而，React会对SSR中的useLayoutEffect发出警告, 避免警告
    // 相当于在 useLayoutEffect 中执行, 包装了一下
    // 第一个参数是待执行函数, 第二个是函数参数, 第三个依赖
    useIsomorphicLayoutEffectWithArgs(captureWrapperProps, [
        lastWrapperProps,
        lastChildProps,
        renderIsScheduled,
        wrapperProps,
        actualChildProps,
        childPropsFromStoreUpdate,
        notifyNestedSubs,
    ])

    // 我们的重新订阅逻辑只有在 store或者订阅设置发生变化时才会运行。
    useIsomorphicLayoutEffectWithArgs(
        subscribeUpdates,
        [
            shouldHandleStateChanges,
            store,
            subscription,
            childPropsSelector,
            lastWrapperProps,
            lastChildProps,
            renderIsScheduled,
            childPropsFromStoreUpdate,
            notifyNestedSubs,
            forceComponentUpdateDispatch,
        ],
        [store, subscription, childPropsSelector]
    )

    // 现在所有这些都完成了，我们终于可以尝试实际渲染子组件了。
    // 我们将渲染后的子组件的元素进行记忆，作为一种优化。
    const renderedWrappedComponent = useMemo(
        () => (
            <WrappedComponent
                {...actualChildProps}
                ref={reactReduxForwardedRef}
            />
        ),
        [reactReduxForwardedRef, WrappedComponent, actualChildProps]
    )

    // 如果React看到了与上次完全相同的元素引用，它就会退出重新渲染该子元素，就像在React.memo()中被包裹或从shouldComponentUpdate中返回false一样。
    const renderedChild = useMemo(() => {

        // 确定这个 hoc 是否会监听 store 的改变, 默认是 true
        if (shouldHandleStateChanges) {
            // 如果这个组件订阅了存储更新，我们需要将它自己的订阅实例传递给我们的子孙。
            // 这意味着渲染相同的Context实例，并将不同的值放入context中。
            return (
                <ContextToUse.Provider value={overriddenContextValue}>
                    {renderedWrappedComponent}
                </ContextToUse.Provider>
            )
        }

        return renderedWrappedComponent
    }, [ContextToUse, renderedWrappedComponent, overriddenContextValue])

    return renderedChild
}

```

这一部分便是 connect 的核心代码

再肢解一下上面的代码可分为一下几个步骤:

确定 Context -> 确定 store 来源 -> 将一个订阅,发布合并到 contextValue 中 ->  组件更新后, 检查 store 值是否变化 -> 返回包装组件

再解释这部分代码中的引用的部分函数: `captureWrapperProps` , `subscribeUpdates`

#### captureWrapperProps

代码是在这里:

```js
 useIsomorphicLayoutEffectWithArgs(captureWrapperProps, [
    lastWrapperProps,
    lastChildProps,
    renderIsScheduled,
    wrapperProps,
    actualChildProps,
    childPropsFromStoreUpdate,
    notifyNestedSubs,
])
```

转换一下:

```js
useLayoutEffect(() => {
    captureWrapperProps(
        lastWrapperProps,
        lastChildProps,
        renderIsScheduled,
        wrapperProps,
        actualChildProps,
        childPropsFromStoreUpdate,
        notifyNestedSubs
    )
})

function captureWrapperProps(
    lastWrapperProps,
    lastChildProps,
    renderIsScheduled,
    wrapperProps,
    actualChildProps,
    childPropsFromStoreUpdate,
    notifyNestedSubs
) {
    lastWrapperProps.current = wrapperProps
    lastChildProps.current = actualChildProps
    renderIsScheduled.current = false

    // 如果渲染是来自store的更新，则清除该引用 并且触发订阅
    if (childPropsFromStoreUpdate.current) {
        childPropsFromStoreUpdate.current = null
        notifyNestedSubs()
    }
}
```

#### subscribeUpdates

源码:

```js
useIsomorphicLayoutEffectWithArgs(
    subscribeUpdates,
    [
        shouldHandleStateChanges,
        store,
        subscription,
        childPropsSelector,
        lastWrapperProps,
        lastChildProps,
        renderIsScheduled,
        childPropsFromStoreUpdate,
        notifyNestedSubs,
        forceComponentUpdateDispatch,
    ],
    [store, subscription, childPropsSelector]
)
```

同样地经过转换:

```js
useLayoutEffect(() => {
    subscribeUpdates(
        shouldHandleStateChanges,
        store,
        subscription,
        childPropsSelector,
        lastWrapperProps,
        lastChildProps,
        renderIsScheduled,
        childPropsFromStoreUpdate,
        notifyNestedSubs,
        forceComponentUpdateDispatch,
    )
}, [store, subscription, childPropsSelector])
```

我们再看 `subscribeUpdates` 做了什么, 这里就比较复杂了:

```js
function subscribeUpdates(
    shouldHandleStateChanges,
    store,
    subscription,
    childPropsSelector,
    lastWrapperProps,
    lastChildProps,
    renderIsScheduled,
    childPropsFromStoreUpdate,
    notifyNestedSubs,
    forceComponentUpdateDispatch
) {
    // 如果不想从 store 中更新, 则直接返回
    if (!shouldHandleStateChanges) return

    let didUnsubscribe = false
    let lastThrownError = null

    // 每次 store 的订阅更新传播到这个组件时，我们都会运行这个回调。
    const checkForUpdates = () => {
        if (didUnsubscribe) {
            // Redux不能保证取消订阅会在下一次发送之前发生。
            return
        }

        const latestStoreState = store.getState()

        let newChildProps, error
        try {
            // 用最新的store状态和包装运行选择器
            newChildProps = childPropsSelector(
                latestStoreState,
                lastWrapperProps.current
            )
        } catch (e) {
            error = e
            lastThrownError = e
        }

        if (!error) {
            lastThrownError = null
        }

        // 如果没变化就不做什么
        if (newChildProps === lastChildProps.current) {
            if (!renderIsScheduled.current) {
                notifyNestedSubs()
            }
        } else {
            // 保存对新的子props的引用。 
            lastChildProps.current = newChildProps
            childPropsFromStoreUpdate.current = newChildProps
            renderIsScheduled.current = true

            // If the child props _did_ change (or we caught an error), this wrapper component needs to re-render
            // 如果 子 props 确实发生了变化, 那么  wrapperComponent 需要重渲染
            forceComponentUpdateDispatch({
                type: 'STORE_UPDATED',
                payload: {
                    error,
                },
            })
        }
    }

    subscription.onStateChange = checkForUpdates
    subscription.trySubscribe()

    // 执行 
    checkForUpdates()

    // 在第一次渲染后从store拉出数据，以防store在我们开始后发生变化。
    const unsubscribeWrapper = () => {
        didUnsubscribe = true
        subscription.tryUnsubscribe()
        subscription.onStateChange = null


        // 如果出错, 但是到此声明周期还没解决, 就触发报错
        if (lastThrownError) {
            throw lastThrownError
        }
    }

    return unsubscribeWrapper
}

```

从这几行可以看出来, store 或者 props 的变化都会导致此包装组件的再渲染, 选渲染中又加上了判断, 可以控制子组件是否真的能够渲染

### 补漏

#### selectorFactory
这函数是获取 store 的, 之前使用的地方

```js
// childPropsSelector使用 1
newChildProps = childPropsSelector(
        latestStoreState,
        lastWrapperProps.current
)
// childPropsSelector使用 2
childPropsSelector(store.getState(), wrapperProps)

const childPropsSelector = useMemo(() => {
    return createChildSelector(store)
}, [store])

function createChildSelector(store) {
    return selectorFactory(store.dispatch, selectorFactoryOptions)
}
```
在默认情况下 selectorFactory = defaultSelectorFactory  
源文件: `react-redux/src/connect/selectorFactory.js`


`defaultSelectorFactory` 别名: `finalPropsSelectorFactory`
```js

// 如果pure为true，则selectorFactory返回的选择器将记住其结果，
// 如果未更改结果，则connectAdvanced的shouldComponentUpdate可以返回false。
// 如果为false，则选择器将始终返回新对象，而shouldComponentUpdate将始终返回true。

// 默认的选择器工厂
export default function finalPropsSelectorFactory(
  dispatch,
  { initMapStateToProps, initMapDispatchToProps, initMergeProps, ...options }
) {

  // initMapStateToProps 可在 connect 中查看 就是通过 match 获取的结果
  const mapStateToProps = initMapStateToProps(dispatch, options)
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  const mergeProps = initMergeProps(dispatch, options)

  // 忽略验证

  const selectorFactory = options.pure
    ? pureFinalPropsSelectorFactory
    : impureFinalPropsSelectorFactory

  return selectorFactory(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    dispatch,
    options
  )
}

```

这里再次进行到下一流程 `initMapStateToProps` , `initMapDispatchToProps` , `initMergeProps`:
这三个变量的来源是在这里:

```js
const initMapStateToProps = match(
  mapStateToProps,
  mapStateToPropsFactories,
  'mapStateToProps'
)

const initMapDispatchToProps = match(
  mapDispatchToProps,
  mapDispatchToPropsFactories,
  'mapDispatchToProps'
)

const initMergeProps = match(mergeProps, mergePropsFactories, 'mergeProps')
```

而这, 我们又接触到了新的几个参数 `match`, `mapStateToPropsFactories` ,`mapDispatchToPropsFactories` ,`mergePropsFactories`:

##### match

先说说 match, 来看看源码:

```js
function match(arg, factories, name) {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }

  return (dispatch, options) => {
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }
}
```
这个的作用,我们之前也略微讲过, 就是通过执行 factories 中的函数, 如果有返回值则返回对应的值

而这里我们也需要说下这几个 `Factories`: `defaultMapStateToPropsFactories`, `defaultMapDispatchToPropsFactories`, `defaultMergePropsFactories`

##### defaultMapStateToPropsFactories

```js
export function whenMapStateToPropsIsFunction(mapStateToProps) {
  return typeof mapStateToProps === 'function'
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

export function whenMapStateToPropsIsMissing(mapStateToProps) {
  return !mapStateToProps ? wrapMapToPropsConstant(() => ({})) : undefined
}

export default [whenMapStateToPropsIsFunction, whenMapStateToPropsIsMissing]

```

经过之前我们的 `connect` 用法的介绍:
```ts
mapStateToProps?: (state, ownProps?) => Object
```
如果 `mapStateToProps` 传的是一个函数, 则用 `wrapMapToPropsFunc` 包裹, 不然就包裹一个空函数

我们再来看下 `wrapMapToPropsFunc`:
```js
export function wrapMapToPropsFunc(mapToProps, methodName) {
  return function initProxySelector(dispatch, { displayName }) {
    const proxy = function mapToPropsProxy(stateOrDispatch, ownProps) {
      return proxy.dependsOnOwnProps
        ? proxy.mapToProps(stateOrDispatch, ownProps)
        : proxy.mapToProps(stateOrDispatch)
    }

    proxy.dependsOnOwnProps = true

    proxy.mapToProps = function detectFactoryAndVerify(
      stateOrDispatch,
      ownProps
    ) {
      proxy.mapToProps = mapToProps
      proxy.dependsOnOwnProps = getDependsOnOwnProps(mapToProps)
      let props = proxy(stateOrDispatch, ownProps)

      if (typeof props === 'function') {
        proxy.mapToProps = props
        proxy.dependsOnOwnProps = getDependsOnOwnProps(props)
        props = proxy(stateOrDispatch, ownProps)
      }

      // 注释验证
      
      return props
    }

    return proxy
  }
}

// dependsOnOwnProps默认为 true
// 判断 mapToProps 的dependsOnOwnProps属性是否为空,
// 如果不为空则, 则返回 Boolean(dependsOnOwnProps), 如果为空, 则比较后返回 布尔值
function getDependsOnOwnProps(mapToProps) {
  return mapToProps.dependsOnOwnProps !== null &&
  mapToProps.dependsOnOwnProps !== undefined
          ? Boolean(mapToProps.dependsOnOwnProps)
          : mapToProps.length !== 1
}
```

经历过 match 的遍历, 返回的就是 `initProxySelector`, 这个地方设计得很巧妙
`initProxySelector` 的时候, 传入值: `dispatch, options`, 这里 options 可以暂时忽略 , 这里是有mapToProps的入参 
他的返回结果也是一个函数, 即 proxy 函数

##### proxy 第一次执行: 
执行的是 `proxy.mapToProps(stateOrDispatch, ownProps)` 即 `detectFactoryAndVerify`
覆盖原 `mapToProps`: `proxy.mapToProps = mapToProps` 这里覆盖的就是我们传入的 `mapStateToProps` 函数 / 或者 undefined,  
`proxy.dependsOnOwnProps` 正常情况下都是返回 true  
这时候 再次执行 `proxy`:  `let props = proxy(stateOrDispatch, ownProps)`
转换一下: `mapToProps(stateOrDispatch, ownProps)`, 这里的 `mapToProps` 是我们传入的,  
之后继续往下走:
```js
if (typeof props === 'function') {
  proxy.mapToProps = props
  proxy.dependsOnOwnProps = getDependsOnOwnProps(props)
  props = proxy(stateOrDispatch, ownProps)
}
```
这里是对于返回结果又做了一层判断, 如果返回的是一个函数, 将会覆盖


##### 总结下流程:  
我们传递的 `mapStateToProps` ->  
经过 `match 函数` ->    
`match` 函数中的 `wrapMapToPropsFunc` ->  
现在执行的是 `initProxySelector` ->  
别名 `initMapStateToProps`  ->  
通过执行他 获得结果 `const mapStateToProps = initMapStateToProps(dispatch, options)`  ->  
通过 `finalPropsSelectorFactory` 的包装 ->    
别名 `selectorFactory` ->  
在函数中杯执行 `selectorFactory(store.dispatch, selectorFactoryOptions)` ->  
返回的值, 作为 `childPropsSelector` 的值 ->  
在新旧 props 比较时使对此这个值


现在来看下执行流程



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
