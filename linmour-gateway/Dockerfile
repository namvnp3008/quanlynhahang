FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} gateway.jar
EXPOSE 12800
ENTRYPOINT ["java", "-jar", "gateway.jar"]
