package com.westshoredrone.watch

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class KeepScreenOnPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == KeepScreenOnModule.NAME) KeepScreenOnModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                KeepScreenOnModule.NAME to ReactModuleInfo(
                    KeepScreenOnModule.NAME,
                    KeepScreenOnModule::class.java.name,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    false, // isCxxModule
                    // isTurboModule = false: KeepScreenOnModule extends
                    // ReactContextBaseJavaModule and uses the legacy bridge under
                    // both arches. No codegen spec; the JS side accesses it via
                    // NativeModules.KeepScreenOn.
                    false, // isTurboModule
                )
            )
        }
    }
}
