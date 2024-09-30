import com.vanniktech.maven.publish.JavadocJar
import com.vanniktech.maven.publish.KotlinJvm

plugins {
    kotlin("jvm")
    id("com.vanniktech.maven.publish") version "0.29.0"
    `maven-publish`
    id("org.jetbrains.dokka") version "1.9.20"
}


mavenPublishing {
    configure(
        KotlinJvm(
        javadocJar = JavadocJar.Dokka("dokkaHtml"),
        sourcesJar = true,
        )
    )
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(kotlin("stdlib"))
}
