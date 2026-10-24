FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} product.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "product.jar"]
