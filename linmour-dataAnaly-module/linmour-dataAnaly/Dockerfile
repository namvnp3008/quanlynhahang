FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} dataAnaly.jar
EXPOSE 8086
ENTRYPOINT ["java", "-jar", "dataAnaly.jar"]
