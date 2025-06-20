import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import { invoke } from '@tauri-apps/api/core'
import { restoreStateCurrent, saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state'

import App from './App.vue'
import router from './router'
import { useThemeStore } from './stores/theme'
import { useConfigStore } from './stores/config'
import {
    initializeAllConfigs,
    initializeDefaultApiSources,
    initializeDefaultBookApiSources
} from './config/server-config'
import { initializeUIConfig, loadUIConfig } from './config/ui-config'
import { initTray } from './utils/tray'

import './assets/styles/main.scss'

// 初始化pinia
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(Antd)

// 挂载应用
app.mount('#app')

// 恢复窗口状态
restoreStateCurrent(StateFlags.ALL).then(() => {
    console.log('窗口状态已恢复')
}).catch((error) => {
    console.warn('恢复窗口状态失败:', error)
})

// 监听窗口关闭事件，保存状态
window.addEventListener('beforeunload', () => {
    saveWindowState(StateFlags.ALL).catch((error) => {
        console.error('保存窗口状态失败:', error)
    })
})

const themeStore = useThemeStore()
const configStore = useConfigStore()

// 创建配置初始化Promise
const initPromise = Promise.all([
    initializeAllConfigs(),
    initializeUIConfig()
]).then(() => {
    return Promise.all([
        initializeDefaultApiSources().then(result => {
            return result
        }).catch(error => {
            throw error
        }),
        initializeDefaultBookApiSources().then(result => {
            return result
        }).catch(error => {
            console.error('默认轻小说API源初始化失败:', error)
            throw error
        })
    ])
}).then(() => {
    if (!configStore.isServerStarted) {
        return invoke('start_proxy_server')
    } else {
        return '代理服务器已经在运行'
    }
}).then((result) => {
    console.log('代理服务器启动结果:', result)
    configStore.setServerStarted()
    return themeStore.initTheme()
}).then(() => {
    // 根据配置决定是否初始化托盘图标
    return loadUIConfig().then(config => {
        const shouldShowTray = config.system?.showTrayIcon || false
        if (shouldShowTray) {
            return initTray()
        } else {
            console.log('托盘图标已禁用，跳过初始化')
            return false
        }
    })
}).then((trayResult) => {
    if (trayResult) {
        console.log('托盘图标初始化成功')
    } else {
        console.log('托盘图标未启用或初始化失败')
    }
    configStore.setInitialized()
    // console.log('所有初始化完成')
}).catch(error => {
    console.error('初始化失败:', error)
    // 详细的错误信息
    if (error.stack) {
        console.error('错误堆栈:', error.stack)
    }
    configStore.setInitialized()
})

// 设置初始化Promise到store
configStore.setInitPromise(initPromise)