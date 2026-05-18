package com.westshoredrone.watch

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class BLEScannerPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == BLEScannerModule.NAME) BLEScannerModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                BLEScannerModule.NAME to ReactModuleInfo(
                    BLEScannerModule.NAME,
                    BLEScannerModule::class.java.name,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    false, // isCxxModule
                    BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, // isTurboModule
                )
            )
        }
    }
}
