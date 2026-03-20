Pod::Spec.new do |spec|
    spec.name                     = 'composeApp'
    spec.version                  = '1.0'
    spec.homepage                 = 'https://example.com'
    spec.source                   = { :http=> ''}
    spec.authors                  = ''
    spec.license                  = ''
    spec.summary                  = 'MVP App for pick up Volleyball events'
    spec.vendored_frameworks      = 'build/cocoapods/framework/ComposeApp.framework'
    spec.libraries                = 'c++'
    spec.ios.deployment_target    = '15.3'
    spec.dependency 'FirebaseCore'
    spec.dependency 'FirebaseMessaging'
    spec.dependency 'GooglePlaces'
    spec.dependency 'GoogleSignIn'
    spec.dependency 'IQKeyboardManagerSwift'
    if !Dir.exist?('build/cocoapods/framework/ComposeApp.framework') || Dir.empty?('build/cocoapods/framework/ComposeApp.framework')
        raise "
        Kotlin framework 'ComposeApp' doesn't exist yet, so a proper Xcode project can't be generated.
        'pod install' should be executed after running ':generateDummyFramework' Gradle task:
            ./gradlew :composeApp:generateDummyFramework
        Alternatively, proper pod installation is performed during Gradle sync in the IDE (if Podfile location is set)"
    end
    spec.xcconfig = {
        'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
    }
    spec.pod_target_xcconfig = {
        'KOTLIN_PROJECT_PATH' => ':composeApp',
        'PRODUCT_MODULE_NAME' => 'ComposeApp',
    }
    spec.script_phases = [
        {
            :name => 'Build composeApp',
            :execution_position => :before_compile,
            :shell_path => '/bin/sh',
            :script => <<-SCRIPT
                if [ "YES" = "$OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED" ]; then
                    echo "Skipping Gradle build task invocation due to OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED environment variable set to \"YES\""
                    exit 0
                fi
                set -ev
                JAVA17_HOME="$(/usr/libexec/java_home -v 17 -a arm64 2>/dev/null || /usr/libexec/java_home -v 17 2>/dev/null || true)"
                if [ -n "$JAVA17_HOME" ]; then
                    export JAVA_HOME="$JAVA17_HOME"
                    export PATH="$JAVA_HOME/bin:$PATH"
                fi

                if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
                    echo "Using JAVA_HOME=$JAVA_HOME"
                    "$JAVA_HOME/bin/java" -version 2>&1 | head -n 1
                else
                    echo "JAVA_HOME is not set to a valid JDK; using java from PATH"
                fi

                REPO_ROOT="$PODS_TARGET_SRCROOT"
                "$REPO_ROOT/../gradlew" --build-cache --configuration-cache \
                    -Dorg.gradle.jvmargs="-Xmx4g -Dfile.encoding=UTF-8 -Djava.awt.headless=true -XX:MaxMetaspaceSize=1g" \
                    -p "$REPO_ROOT" $KOTLIN_PROJECT_PATH:syncFramework \
                    -Pkotlin.native.cocoapods.platform=$PLATFORM_NAME \
                    -Pkotlin.native.cocoapods.archs="$ARCHS" \
                    -Pkotlin.native.cocoapods.configuration="$CONFIGURATION"
            SCRIPT
        }
    ]
    spec.resources = ['build/compose/cocoapods/compose-resources']
end
