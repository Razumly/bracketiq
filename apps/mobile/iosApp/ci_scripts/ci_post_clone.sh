# CI Post-Clone Script for KMP Projects on Xcode Cloud

# This Bash script automates post-clone tasks for Kotlin Multiplatform (KMP) projects in Xcode Cloud CI environments. It handles:

# - Gradle cache recovery
# - JDK installation (if needed)
# - Shared module building
# - CocoaPods dependency installation

# Designed to streamline CI/CD pipelines for KMP projects with iOS targets.

# Just add into your iosApp/ci_scripts/ci_post_clone.sh and run `chmod +x iosApp/ci_scripts/ci_post_clone.sh`
# After first run set the JAVA_HOME environment variable from the printed location

#!/bin/sh

set -e  # Exit immediately if a command exits with a non-zero status

# Define variables
root_dir=$CI_WORKSPACE_PATH
repo_dir=$CI_PRIMARY_REPOSITORY_PATH
jdk_dir="${CI_DERIVED_DATA_PATH}/JDK"
gradle_dir="${repo_dir}/composeApp"
cache_dir="${CI_DERIVED_DATA_PATH}/.gradle"
jdk_version="20.0.1"

# Function to recover cache files
recover_cache_files() {
    echo "\nRecover cache files"

    if [ ! -d "$cache_dir" ]; then
        echo " - No valid caches found, skipping"
        return 0
    fi

    echo " - Copying gradle cache to ${gradle_dir}"
    rm -rf "${gradle_dir}/.gradle"
    cp -r "$cache_dir" "$gradle_dir"

    return 0
}

# Function to install the JDK if needed
install_jdk_if_needed() {
    echo "\nInstall JDK if needed"

    if [[ $(uname -m) == "arm64" ]]; then
        echo " - Detected M1"
        arch_type="aarch64"
        jdk_url="https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_macos-aarch64_bin.tar.gz"
    else
        echo " - Detected Intel"
        arch_type="x64"
        jdk_url="https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_macos-x64_bin.tar.gz"
    fi

    # Location of version / arch detection file
    detect_loc="${jdk_dir}/.17.0.2.${arch_type}"

    if [ -f "$detect_loc" ]; then
        echo " - Found a valid JDK installation, skipping install"
        return 0
    fi

    echo " - No valid JDK installation found, installing..."

    tar_name="openjdk-17.0.2_macos-${arch_type}_bin.tar.gz"

    # Download from more reliable OpenJDK source
    curl -L -o "$tar_name" "$jdk_url"
    tar xzf "$tar_name" -C "$root_dir"

    # Move the JDK to our desired location
    rm -rf "$jdk_dir"
    mkdir -p "$jdk_dir"
    mv "${root_dir}/jdk-17.0.2.jdk/Contents/Home" "$jdk_dir"

    # Cleanup
    rm -r "${root_dir}/jdk-17.0.2.jdk"
    rm "$tar_name"

    # Add the detection file for subsequent builds
    touch "$detect_loc"

    echo " - Set JAVA_HOME in Xcode Cloud to ${jdk_dir}/Home"

    return 0
}


# Function to build the shared module
build_shared_module() {
    echo "\nBuild the shared module"

    cd "$repo_dir"
    ./gradlew :composeApp:generateDummyFramework

    return 0
}

# Function to install CocoaPods dependencies
install_pods() {
    echo "\nInstall CocoaPods dependencies"

    HOMEBREW_NO_AUTO_UPDATE=1 # disable homebrew's automatic updates.

    # Check if CocoaPods is installed
    if ! command -v pod &> /dev/null; then
        echo " - CocoaPods not found, installing..."
        brew install cocoapods
    else
        echo " - CocoaPods already installed"
    fi

    cd "$repo_dir/iosApp"

    if [ -f "Podfile" ]; then
        echo " - Podfile found, running pod install"
        pod install
    else
        echo " - No Podfile found, skipping pod install"
    fi

    return 0
}

# Execute functions
recover_cache_files
install_jdk_if_needed
build_shared_module
install_pods

echo "Script execution completed successfully."