import hoistStatics from 'hoist-non-react-statics'
import React, {useContext, useMemo, useReducer, useRef} from 'react'
import {isContextConsumer, isValidElementType} from 'react-is'
import Subscription from '../utils/Subscription'
import {useIsomorphicLayoutEffect} from '../utils/useIsomorphicLayoutEffect'

import {ReactReduxContext} from './Context'

// Define some constant arrays just to avoid re-creating these
const EMPTY_ARRAY = []
const NO_SUBSCRIPTION_ARRAY = [null, null]

const stringifyComponent = (Comp) => {
    try {
        return JSON.stringify(Comp)
    } catch (err) {
        return String(Comp)
    }
}

function storeStateUpdatesReducer(state, action) {
    const [, updateCount] = state
    return [action.payload, updateCount + 1]
}

function useIsomorphicLayoutEffectWithArgs(
    effectFunc,
    effectArgs,
    dependencies
) {
    useIsomorphicLayoutEffect(() => effectFunc(...effectArgs), dependencies)
}

function captureWrapperProps(
    lastWrapperProps,
    lastChildProps,
    renderIsScheduled,
    wrapperProps,
    actualChildProps,
    childPropsFromStoreUpdate,
    notifyNestedSubs
) {
    // We want to capture the wrapper props and child props we used for later comparisons
    lastWrapperProps.current = wrapperProps
    lastChildProps.current = actualChildProps
    renderIsScheduled.current = false

    // If the render was from a store update, clear out that reference and cascade the subscriber update
    if (childPropsFromStoreUpdate.current) {
        childPropsFromStoreUpdate.current = null
        notifyNestedSubs()
    }
}

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
    // If we're not subscribed to the store, nothing to do here
    if (!shouldHandleStateChanges) return

    // Capture values for checking if and when this component unmounts
    let didUnsubscribe = false
    let lastThrownError = null

    // We'll run this callback every time a store subscription update propagates to this component
    const checkForUpdates = () => {
        if (didUnsubscribe) {
            // Don't run stale listeners.
            // Redux doesn't guarantee unsubscriptions happen until next dispatch.
            return
        }

        const latestStoreState = store.getState()

        let newChildProps, error
        try {
            // Actually run the selector with the most recent store state and wrapper props
            // to determine what the child props should be
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

        // If the child props haven't changed, nothing to do here - cascade the subscription update
        if (newChildProps === lastChildProps.current) {
            if (!renderIsScheduled.current) {
                notifyNestedSubs()
            }
        } else {
            // Save references to the new child props.  Note that we track the "child props from store update"
            // as a ref instead of a useState/useReducer because we need a way to determine if that value has
            // been processed.  If this went into useState/useReducer, we couldn't clear out the value without
            // forcing another re-render, which we don't want.
            lastChildProps.current = newChildProps
            childPropsFromStoreUpdate.current = newChildProps
            renderIsScheduled.current = true

            // If the child props _did_ change (or we caught an error), this wrapper component needs to re-render
            forceComponentUpdateDispatch({
                type: 'STORE_UPDATED',
                payload: {
                    error,
                },
            })
        }
    }

    // Actually subscribe to the nearest connected ancestor (or store)
    subscription.onStateChange = checkForUpdates
    subscription.trySubscribe()

    // Pull data from the store after first render in case the store has
    // changed since we began.
    checkForUpdates()

    const unsubscribeWrapper = () => {
        didUnsubscribe = true
        subscription.tryUnsubscribe()
        subscription.onStateChange = null

        if (lastThrownError) {
            // It's possible that we caught an error due to a bad mapState function, but the
            // parent re-rendered without this component and we're about to unmount.
            // This shouldn't happen as long as we do top-down subscriptions correctly, but
            // if we ever do those wrong, this throw will surface the error in our tests.
            // In that case, throw the error from here so it doesn't get lost.
            throw lastThrownError
        }
    }

    return unsubscribeWrapper
}

const initStateUpdates = () => [null, 0]


//connect  第二步的主体
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

    // 开发情况下的报错  我们以准生产的代码为主
    if (process.env.NODE_ENV !== 'production') {
        if (renderCountProp !== undefined) {
            throw new Error(
                `renderCountProp is removed. render counting is built into the latest React Dev Tools profiling extension`
            )
        }
        if (withRef) {
            throw new Error(
                'withRef is removed. To access the wrapped instance, use a ref on the connected component'
            )
        }

        const customStoreWarningMessage =
            'To use a custom Redux store for specific components, create a custom React context with ' +
            "React.createContext(), and pass the context object to React Redux's Provider and specific components" +
            ' like: <Provider context={MyContext}><ConnectedComponent context={MyContext} /></Provider>. ' +
            'You may also pass a {context : MyContext} option to connect'

        if (storeKey !== 'store') {
            throw new Error(
                'storeKey has been removed and does not do anything. ' +
                customStoreWarningMessage
            )
        }
    }

    const Context = context

    // 第二部执行的函数  connect(map)(Component)  中就是这里的  (Component)
    return function wrapWithConnect(WrappedComponent) {
        if (
            process.env.NODE_ENV !== 'production' &&
            !isValidElementType(WrappedComponent)
        ) {
            throw new Error(
                `You must pass a component to the function returned by ` +
                `${methodName}. Instead received ${stringifyComponent(
                    WrappedComponent
                )}`
            )
        }

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

            // 如果都不是 则报错
            if (
                process.env.NODE_ENV !== 'production' &&
                !didStoreComeFromProps &&
                !didStoreComeFromContext
            ) {
                throw new Error(
                    `Could not find "store" in the context of ` +
                    `"${displayName}". Either wrap the root component in a <Provider>, ` +
                    `or pass a custom React context provider to <Provider> and the corresponding ` +
                    `React context consumer to ${displayName} in connect options.`
                )
            }

            // 获取 store  赋值
            const store = didStoreComeFromProps ? props.store : contextValue.store

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

            // Determine what {store, subscription} value should be put into nested context, if necessary,
            // and memoize that value to avoid unnecessary context updates.
            const overriddenContextValue = useMemo(() => {
                if (didStoreComeFromProps) {
                    // This component is directly subscribed to a store from props.
                    // We don't want descendants reading from this store - pass down whatever
                    // the existing context value is from the nearest connected ancestor.
                    return contextValue
                }

                // Otherwise, put this component's subscription instance into context, so that
                // connected descendants won't update until after this component is done
                return {
                    ...contextValue,
                    subscription,
                }
            }, [didStoreComeFromProps, contextValue, subscription])

            // We need to force this wrapper component to re-render whenever a Redux store update
            // causes a change to the calculated child component props (or we caught an error in mapState)
            const [
                [previousStateUpdateResult],
                forceComponentUpdateDispatch,
            ] = useReducer(storeStateUpdatesReducer, EMPTY_ARRAY, initStateUpdates)

            // Propagate any mapState/mapDispatch errors upwards
            if (previousStateUpdateResult && previousStateUpdateResult.error) {
                throw previousStateUpdateResult.error
            }

            // Set up refs to coordinate values between the subscription effect and the render logic
            const lastChildProps = useRef()
            const lastWrapperProps = useRef(wrapperProps)
            const childPropsFromStoreUpdate = useRef()
            const renderIsScheduled = useRef(false)

            const actualChildProps = usePureOnlyMemo(() => {
                // Tricky logic here:
                // - This render may have been triggered by a Redux store update that produced new child props
                // - However, we may have gotten new wrapper props after that
                // If we have new child props, and the same wrapper props, we know we should use the new child props as-is.
                // But, if we have new wrapper props, those might change the child props, so we have to recalculate things.
                // So, we'll use the child props from store update only if the wrapper props are the same as last time.
                if (
                    childPropsFromStoreUpdate.current &&
                    wrapperProps === lastWrapperProps.current
                ) {
                    return childPropsFromStoreUpdate.current
                }

                // TODO We're reading the store directly in render() here. Bad idea?
                // This will likely cause Bad Things (TM) to happen in Concurrent Mode.
                // Note that we do this because on renders _not_ caused by store updates, we need the latest store state
                // to determine what the child props should be.
                return childPropsSelector(store.getState(), wrapperProps)
            }, [store, previousStateUpdateResult, wrapperProps])

            // We need this to execute synchronously every time we re-render. However, React warns
            // about useLayoutEffect in SSR, so we try to detect environment and fall back to
            // just useEffect instead to avoid the warning, since neither will run anyway.
            useIsomorphicLayoutEffectWithArgs(captureWrapperProps, [
                lastWrapperProps,
                lastChildProps,
                renderIsScheduled,
                wrapperProps,
                actualChildProps,
                childPropsFromStoreUpdate,
                notifyNestedSubs,
            ])

            // Our re-subscribe logic only runs when the store/subscription setup changes
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

            // Now that all that's done, we can finally try to actually render the child component.
            // We memoize the elements for the rendered child component as an optimization.
            const renderedWrappedComponent = useMemo(
                () => (
                    <WrappedComponent
                        {...actualChildProps}
                        ref={reactReduxForwardedRef}
                    />
                ),
                [reactReduxForwardedRef, WrappedComponent, actualChildProps]
            )

            // If React sees the exact same element reference as last time, it bails out of re-rendering
            // that child, same as if it was wrapped in React.memo() or returned false from shouldComponentUpdate.
            const renderedChild = useMemo(() => {
                if (shouldHandleStateChanges) {
                    // If this component is subscribed to store updates, we need to pass its own
                    // subscription instance down to our descendants. That means rendering the same
                    // Context instance, and putting a different value into the context.
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

        // 通过 pure 来确定是否要加 memo
        const Connect = pure ? React.memo(ConnectFunction) : ConnectFunction

        Connect.WrappedComponent = WrappedComponent
        Connect.displayName = displayName

        // 关于 forwardRef 的补充
        if (forwardRef) {
            const forwarded = React.forwardRef(function forwardConnectRef(
                props,
                ref
            ) {
                return <Connect {...props} reactReduxForwardedRef={ref}/>
            })

            forwarded.displayName = displayName
            forwarded.WrappedComponent = WrappedComponent
            return hoistStatics(forwarded, WrappedComponent)
        }

        return hoistStatics(Connect, WrappedComponent)
    }
}
