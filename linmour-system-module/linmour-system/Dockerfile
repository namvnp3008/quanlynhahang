FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} system.jar
EXPOSE 12801
ENTRYPOINT ["java", "-jar", "system.jar"]
