pluginManagement {
    repositories {
        // 1. 添加阿里云镜像源（放在最前面）
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }

        // 2. 原有的源保留在后面作为备用
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        // 1. 添加阿里云镜像源
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://maven.aliyun.com/repository/google") }

        // 2. 原有的源
        google()
        mavenCentral()
    }
}

// 确保这里的名字和你项目名一致，根据你截图看是 PDFpro
rootProject.name = "PDFpro"
include(":app")