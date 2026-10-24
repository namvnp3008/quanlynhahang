FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} system.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "system.jar"]
