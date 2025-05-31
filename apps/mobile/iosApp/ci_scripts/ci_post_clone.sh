#!/bin/sh

echo "Running post-clone script..."

# Navigate to mvp-app directory
cd ../..

echo "Building Kotlin framework..."
./gradlew :composeApp:linkPodDebugFrameworkIosArm64
./gradlew :composeApp:linkPodDebugFrameworkIosX64
./gradlew :composeApp:linkPodDebugFrameworkIosSimulatorArm64

cd iosApp || exit

# Check if Podfile exists
if [ ! -f "Podfile" ]; then
    echo "Error: Podfile not found in iosApp directory"
    exit 1
fi

# Install CocoaPods if not available
if ! command -v pod &> /dev/null; then
    echo "Installing CocoaPods..."
    sudo gem install cocoapods
fi

# Update CocoaPods repo
echo "Updating CocoaPods repo..."
pod repo update

# Install pods
echo "Installing pods..."
pod install

# Verify workspace was created
if [ ! -d "iosApp.xcworkspace" ]; then
    echo "Error: Workspace not found after pod install"
    exit 1
fi

echo "Post-clone script completed successfully"
