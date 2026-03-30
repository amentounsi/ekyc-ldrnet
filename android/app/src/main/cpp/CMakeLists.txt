# CMakeLists.txt for Card Detection Native Module
# Requires OpenCV Android SDK to be placed in android/app/src/main/cpp/opencv

cmake_minimum_required(VERSION 3.22)
project(CardDetectorModule)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OpenCV Configuration
# Set the path to OpenCV Android SDK
set(OpenCV_DIR ${CMAKE_CURRENT_SOURCE_DIR}/OpenCV-android-sdk/sdk/native/jni)

# Find OpenCV package
find_package(OpenCV REQUIRED)

if(OpenCV_FOUND)
    message(STATUS "OpenCV found: ${OpenCV_VERSION}")
    message(STATUS "OpenCV include dirs: ${OpenCV_INCLUDE_DIRS}")
    message(STATUS "OpenCV libs: ${OpenCV_LIBS}")
else()
    message(FATAL_ERROR "OpenCV not found. Please download OpenCV Android SDK and place it in android/app/src/main/cpp/opencv")
endif()

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/warp
    ${CMAKE_CURRENT_SOURCE_DIR}/validation
    ${OpenCV_INCLUDE_DIRS}
)

# Source files
set(SOURCES
    CardDetector.cpp
    CardDetectorJNI.cpp
    warp/CardWarper.cpp
    validation/CardSideClassifier.cpp
    validation/OfficialCINValidator.cpp
    validation/LivePresenceValidator.cpp
)

# Header files
set(HEADERS
    CardDetector.h
    warp/CardWarper.h
    validation/CardSideClassifier.h
    validation/OfficialCINValidator.h
    validation/LivePresenceValidator.h
)

# Create shared library
add_library(
    carddetector
    SHARED
    ${SOURCES}
    ${HEADERS}
)

# Link libraries
target_link_libraries(
    carddetector
    ${OpenCV_LIBS}
    android
    log
    jnigraphics
)

# Optimization flags for release build
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    target_compile_options(carddetector PRIVATE
        -O3
        -ffast-math
        -fno-exceptions
    )
endif()

# Enable OpenCV optimizations
target_compile_definitions(carddetector PRIVATE
    CV_ENABLE_INTRINSICS=1
)
